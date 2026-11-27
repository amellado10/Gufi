-- Sales pipeline: configurable stages, opportunities (deals) and an activity log.
--
-- A lead is a client with status 'prospect' plus an opportunity, so companies are entered once
-- and keep their history when they become clients.
-- Access: admin, project_manager, marketing read and write; finance reads; team sees nothing.

create type public.stage_kind as enum ('open', 'won', 'lost');
create type public.lead_source as enum ('referral', 'partner', 'website', 'outbound', 'marketing', 'existing_client', 'other');
create type public.activity_kind as enum ('note', 'call', 'email', 'meeting', 'stage_change');

-- ── Stages (configurable per organization) ──────────────────────────────────

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  kind public.stage_kind not null default 'open',
  position integer not null,
  -- Chance of winning, used for the weighted pipeline value (basis points: 2500 = 25%).
  probability_bps integer not null default 0 check (probability_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (organization_id, id)
);

-- Default stages for an organization (AGENTS.md §5.2).
create function private.seed_pipeline_stages(org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.pipeline_stages (organization_id, key, name, kind, position, probability_bps) values
    (org, 'new', 'New', 'open', 1, 1000),
    (org, 'qualified', 'Qualified', 'open', 2, 2500),
    (org, 'proposal_sent', 'Proposal sent', 'open', 3, 5000),
    (org, 'negotiation', 'Negotiation', 'open', 4, 7500),
    (org, 'won', 'Won', 'won', 5, 10000),
    (org, 'lost', 'Lost', 'lost', 6, 0)
  on conflict (organization_id, key) do nothing;
$$;

create function private.seed_new_organization() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_pipeline_stages(new.id);
  return new;
end;
$$;
create trigger organizations_seed_pipeline after insert on public.organizations
  for each row execute function private.seed_new_organization();

select private.seed_pipeline_stages(id) from public.organizations;

-- ── Opportunities ───────────────────────────────────────────────────────────

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  contact_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  stage_id uuid not null,
  value_cents bigint check (value_cents is null or value_cents >= 0), -- estimated, before tax
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  owner_id uuid,
  source public.lead_source not null default 'other',
  source_detail text check (source_detail is null or length(source_detail) <= 200),
  brought_by_partner_id uuid, -- who brought the client (the 15% in the split)
  expected_close_on date,
  next_follow_up_on date,
  closed_on date,
  lost_reason text check (lost_reason is null or length(lost_reason) <= 1000),
  won_project_id uuid,
  notes text check (notes is null or length(notes) <= 10000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, owner_id) references public.memberships (organization_id, user_id) on delete set null (owner_id),
  foreign key (organization_id, brought_by_partner_id) references public.partners (organization_id, id) on delete set null (brought_by_partner_id),
  foreign key (organization_id, won_project_id) references public.projects (organization_id, id) on delete set null (won_project_id)
);
-- Contacts must belong to the same client (and organization).
alter table public.contacts add constraint contacts_org_client_id_uq unique (organization_id, client_id, id);
alter table public.opportunities add constraint opportunities_contact_fk
  foreign key (organization_id, client_id, contact_id) references public.contacts (organization_id, client_id, id) on delete set null (contact_id);

create index opportunities_org_stage_idx on public.opportunities (organization_id, stage_id);
create index opportunities_client_idx on public.opportunities (client_id);
create index opportunities_follow_up_idx on public.opportunities (organization_id, next_follow_up_on) where next_follow_up_on is not null;

-- Closing: won/lost stages stamp closed_on and require a reason when lost; reopening clears it.
create function private.track_opportunity_stage() returns trigger
language plpgsql set search_path = '' as $$
declare
  stage_kind public.stage_kind;
begin
  select s.kind into stage_kind from public.pipeline_stages s where s.id = new.stage_id;
  if stage_kind = 'open' then
    new.closed_on := null;
    new.lost_reason := null;
  elsif tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then
    new.closed_on := coalesce(new.closed_on, current_date);
  end if;
  if stage_kind = 'lost' and coalesce(btrim(new.lost_reason), '') = '' then
    raise exception 'A lost deal needs a reason' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger opportunities_stage before insert or update on public.opportunities
  for each row execute function private.track_opportunity_stage();

-- ── Activities (timeline on deals and clients) ──────────────────────────────

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  opportunity_id uuid,
  kind public.activity_kind not null default 'note',
  body text not null check (length(btrim(body)) between 1 and 5000),
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);
create index activities_opportunity_idx on public.activities (opportunity_id, occurred_at desc);
create index activities_client_idx on public.activities (client_id, occurred_at desc);

-- Record stage moves in the timeline automatically.
create function private.log_stage_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  from_name text;
  to_name text;
begin
  if old.stage_id is distinct from new.stage_id then
    select name into from_name from public.pipeline_stages where id = old.stage_id;
    select name into to_name from public.pipeline_stages where id = new.stage_id;
    insert into public.activities (organization_id, client_id, opportunity_id, kind, body, created_by)
    values (new.organization_id, new.client_id, new.id, 'stage_change',
            format('Moved from %s to %s', from_name, to_name)
              || case when new.lost_reason is not null and to_name is not null and new.lost_reason <> coalesce(old.lost_reason, '') then format('. Reason: %s', new.lost_reason) else '' end,
            auth.uid());
  end if;
  return new;
end;
$$;
create trigger opportunities_log_stage after update on public.opportunities
  for each row execute function private.log_stage_change();

-- ── Shared triggers ─────────────────────────────────────────────────────────

create trigger opportunities_updated_at before update on public.opportunities for each row execute function private.set_updated_at();
create trigger opportunities_keep_org before update on public.opportunities for each row execute function private.keep_organization();
create trigger activities_keep_org before update on public.activities for each row execute function private.keep_organization();
create trigger opportunities_audit after insert or update or delete on public.opportunities for each row execute function private.audit();
create trigger pipeline_stages_audit after insert or update or delete on public.pipeline_stages for each row execute function private.audit();

-- ── Grants and RLS ──────────────────────────────────────────────────────────

revoke all on table public.pipeline_stages, public.opportunities, public.activities from anon, authenticated;
grant select on public.pipeline_stages to authenticated;
grant update (name, position, probability_bps) on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;
grant select, insert, delete on public.activities to authenticated;
grant update (body) on public.activities to authenticated;

alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;

create policy "sales roles read stages" on public.pipeline_stages
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "admins rename stages" on public.pipeline_stages
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "sales roles read deals" on public.opportunities
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles create deals" on public.opportunities
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[])
    and created_by = (select auth.uid())
  );
create policy "sales roles update deals" on public.opportunities
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));
create policy "admins delete deals" on public.opportunities
  for delete to authenticated using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "sales roles read activity" on public.activities
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles log activity" on public.activities
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[])
    and created_by = (select auth.uid())
    and kind <> 'stage_change'
  );
create policy "authors edit their notes" on public.activities
  for update to authenticated
  using (created_by = (select auth.uid()) and kind <> 'stage_change')
  with check (created_by = (select auth.uid()) and kind <> 'stage_change');
create policy "authors and admins delete notes" on public.activities
  for delete to authenticated
  using (
    kind <> 'stage_change'
    and (created_by = (select auth.uid()) or private.has_org_role(organization_id, array['admin']::public.org_role[]))
  );
