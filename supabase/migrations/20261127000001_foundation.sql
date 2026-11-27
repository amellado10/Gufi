-- Güfi OS foundation: organizations, people, roles, clients, contacts, projects, audit log.
--
-- Security model (see docs/security.md):
--   * Every business row belongs to exactly one organization (organization_id).
--   * Composite foreign keys (organization_id, x_id) make cross-organization references impossible.
--   * RLS is enabled on every table and denies by default; policies grant access by membership role.
--   * Organizations and memberships are created by server-only scripts (service role), never by the browser.
--   * Helper functions live in the `private` schema, which is NOT exposed through the Supabase API.

create schema if not exists private;

-- ── Types ───────────────────────────────────────────────────────────────────

create type public.org_role as enum ('admin', 'project_manager', 'team', 'finance', 'marketing');
create type public.client_status as enum ('prospect', 'active', 'inactive');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');

-- ── Shared triggers ─────────────────────────────────────────────────────────

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A row can never move to another organization.
create function private.keep_organization() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Organizations and people ────────────────────────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  locale text not null default 'en' check (locale in ('en', 'es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or length(full_name) <= 120),
  avatar_url text,
  locale text check (locale is null or locale in ('en', 'es')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  title text check (title is null or length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Every new auth user gets a profile (email kept in sync).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- ── Clients, contacts, projects ─────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  legal_name text check (legal_name is null or length(legal_name) <= 200),
  website text check (website is null or length(website) <= 300),
  -- Normalized bare domain ("example.com"), used to prevent duplicate companies.
  domain text check (domain is null or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  industry text check (industry is null or length(industry) <= 120),
  status public.client_status not null default 'prospect',
  owner_id uuid,
  notes text check (notes is null or length(notes) <= 10000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  -- The owner must be a member of the same organization.
  foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id) on delete set null (owner_id)
);
create unique index clients_org_name_uq on public.clients (organization_id, lower(btrim(name)));
create unique index clients_org_domain_uq on public.clients (organization_id, domain) where domain is not null;
create index clients_org_status_idx on public.clients (organization_id, status);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) <= 40),
  title text check (title is null or length(title) <= 120),
  is_primary boolean not null default false,
  notes text check (notes is null or length(notes) <= 5000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);
create unique index contacts_org_email_uq on public.contacts (organization_id, lower(email)) where email is not null;
create index contacts_client_idx on public.contacts (client_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 10000),
  status public.project_status not null default 'planning',
  owner_id uuid,
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (start_date is null or due_date is null or due_date >= start_date),
  -- A project's client must be in the same organization; clients with projects can't be deleted.
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id) on delete set null (owner_id)
);
create index projects_org_status_idx on public.projects (organization_id, status);
create index projects_client_idx on public.projects (client_id);
create index projects_org_due_idx on public.projects (organization_id, due_date) where due_date is not null;

create table public.project_members (
  organization_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.memberships (organization_id, user_id) on delete cascade
);
create index project_members_user_idx on public.project_members (user_id);

-- ── Audit log ───────────────────────────────────────────────────────────────

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,                -- auth.uid() of the person; null for scripts / system
  action text not null check (action in ('insert', 'update', 'delete')),
  entity text not null,         -- table name
  entity_id text,
  changes jsonb,                -- new row (insert), changed fields (update), old row (delete)
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  diff jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    diff := '{}'::jsonb;
    for k in select jsonb_object_keys(row_new) loop
      if k <> 'updated_at' and row_new -> k is distinct from row_old -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', row_old -> k, 'to', row_new -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, changes)
  values (
    coalesce(row_new ->> 'organization_id', row_old ->> 'organization_id', row_new ->> 'id', row_old ->> 'id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_new ->> 'id', row_old ->> 'id', row_new ->> 'project_id', row_old ->> 'project_id'),
    case tg_op when 'INSERT' then row_new when 'UPDATE' then diff else row_old end
  );
  return coalesce(new, old);
end;
$$;

-- completed_at is set when a project becomes completed, and cleared if it's reopened.
create function private.track_project_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' then
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger organizations_updated_at before update on public.organizations for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger memberships_updated_at before update on public.memberships for each row execute function private.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function private.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function private.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function private.set_updated_at();

create trigger memberships_keep_org before update on public.memberships for each row execute function private.keep_organization();
create trigger clients_keep_org before update on public.clients for each row execute function private.keep_organization();
create trigger contacts_keep_org before update on public.contacts for each row execute function private.keep_organization();
create trigger projects_keep_org before update on public.projects for each row execute function private.keep_organization();
create trigger projects_completion before insert or update on public.projects for each row execute function private.track_project_completion();

create trigger organizations_audit after update on public.organizations for each row execute function private.audit();
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function private.audit();
create trigger clients_audit after insert or update or delete on public.clients for each row execute function private.audit();
create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function private.audit();
create trigger projects_audit after insert or update or delete on public.projects for each row execute function private.audit();
create trigger project_members_audit after insert or delete on public.project_members for each row execute function private.audit();

-- ── Permission helpers (private schema: callable by policies, not by the API) ─

-- Is the current user a member of `org` (optionally with one of `roles`)?
create function private.has_org_role(org uuid, roles public.org_role[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and (roles is null or m.role = any (roles))
  );
$$;

create function private.is_project_member(project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = project and pm.user_id = (select auth.uid())
  );
$$;

-- Team members (designers/developers) see only clients of projects they're assigned to.
create function private.can_see_client(org uuid, client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(org, array['admin', 'project_manager', 'finance', 'marketing']::public.org_role[])
      or exists (
        select 1
        from public.projects p
        join public.project_members pm on pm.project_id = p.id
        where p.client_id = client and pm.user_id = (select auth.uid())
      );
$$;

create function private.shares_org_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function
  private.has_org_role(uuid, public.org_role[]),
  private.is_project_member(uuid),
  private.can_see_client(uuid, uuid),
  private.shares_org_with(uuid)
to authenticated;

-- ── Grants: nothing for anonymous visitors; column-limited updates where needed ─

revoke all on table
  public.organizations, public.profiles, public.memberships, public.clients,
  public.contacts, public.projects, public.project_members, public.audit_logs
from anon, authenticated;

grant select on public.organizations, public.profiles, public.memberships, public.audit_logs to authenticated;
grant update (name, default_currency, timezone, locale) on public.organizations to authenticated;
grant update (full_name, avatar_url, locale) on public.profiles to authenticated;
grant select, insert, update, delete on public.clients, public.contacts, public.projects to authenticated;
grant select, insert, delete on public.project_members to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.audit_logs enable row level security;

-- Organizations: members read; admins edit settings. Created by scripts only.
create policy "members read their organizations" on public.organizations
  for select to authenticated using (private.has_org_role(id));
create policy "admins update their organization" on public.organizations
  for update to authenticated
  using (private.has_org_role(id, array['admin']::public.org_role[]))
  with check (private.has_org_role(id, array['admin']::public.org_role[]));

-- Profiles: yourself and people in your organizations; edit only yourself.
create policy "read own and teammates' profiles" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.shares_org_with(id));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Memberships: members see their organization's roster. Changes go through scripts (service role).
create policy "members read the roster" on public.memberships
  for select to authenticated using (private.has_org_role(organization_id));

-- Clients
create policy "read permitted clients" on public.clients
  for select to authenticated using (private.can_see_client(organization_id, id));
create policy "sales roles create clients" on public.clients
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[])
    and created_by = (select auth.uid())
  );
create policy "sales roles update clients" on public.clients
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));
create policy "admins delete clients" on public.clients
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- Contacts (client people): not visible to the delivery team role in this phase.
create policy "read contacts" on public.contacts
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'finance', 'marketing']::public.org_role[]));
create policy "sales roles create contacts" on public.contacts
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[])
    and created_by = (select auth.uid())
  );
create policy "sales roles update contacts" on public.contacts
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));
create policy "managers delete contacts" on public.contacts
  for delete to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[]));

-- Projects
create policy "read permitted projects" on public.projects
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'finance']::public.org_role[])
    or private.is_project_member(id)
  );
create policy "managers create projects" on public.projects
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[])
    and created_by = (select auth.uid())
  );
create policy "managers update projects" on public.projects
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[]));
create policy "admins delete projects" on public.projects
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- Project members
create policy "read project assignments" on public.project_members
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'finance']::public.org_role[])
    or private.is_project_member(project_id)
  );
create policy "managers assign people" on public.project_members
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[]));
create policy "managers unassign people" on public.project_members
  for delete to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager']::public.org_role[]));

-- Audit log: admins only, read-only (rows are written by the audit trigger).
create policy "admins read the audit log" on public.audit_logs
  for select to authenticated using (private.has_org_role(organization_id, array['admin']::public.org_role[]));
