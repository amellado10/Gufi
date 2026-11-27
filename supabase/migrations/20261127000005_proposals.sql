-- Proposal studio: proposals, versions (locked once sent), line items, payment schedule,
-- client share links, and acceptance that converts the proposal into a project with finances.
--
-- Client-facing access never uses a service key: anonymous visitors can only call the
-- security-definer functions get_shared_proposal / mark_shared_proposal_viewed /
-- respond_to_shared_proposal with a valid, unexpired token. Those return public fields only.
-- Money: integer cents; quantities in hundredths (150 = 1.5); line totals round half-up.

create type public.proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded');

-- ── Proposals ───────────────────────────────────────────────────────────────

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null,                       -- per organization: 1, 2, 3… shown as P-0001
  client_id uuid not null,
  opportunity_id uuid,
  title text not null check (length(btrim(title)) between 1 and 200),
  language text not null default 'es' check (language in ('es', 'en')),
  status public.proposal_status not null default 'draft', -- status of the latest version
  project_id uuid,                               -- set when accepted
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete set null (opportunity_id),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete set null (project_id)
);
create index proposals_client_idx on public.proposals (client_id);
create index proposals_opportunity_idx on public.proposals (opportunity_id);

create function private.number_proposal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('proposal-number:' || new.organization_id::text));
  select coalesce(max(number), 0) + 1 into new.number from public.proposals where organization_id = new.organization_id;
  return new;
end;
$$;
create trigger proposals_number before insert on public.proposals for each row execute function private.number_proposal();

-- ── Versions ────────────────────────────────────────────────────────────────

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  proposal_id uuid not null,
  version integer not null,
  status public.proposal_status not null default 'draft',
  -- { "sections": [ { "key": "summary", "body": "…" }, … ] }
  content jsonb not null default '{"sections": []}'::jsonb,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  tax_rate_bps integer not null default 700 check (tax_rate_bps between 0 and 10000),
  valid_until date,
  locked_at timestamptz,                         -- set on send; content can't change after
  sent_at timestamptz,
  sent_by uuid references public.profiles (id) on delete set null,
  first_viewed_at timestamptz,
  responded_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (proposal_id, version),
  foreign key (organization_id, proposal_id) references public.proposals (organization_id, id) on delete cascade
);

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_id uuid not null,
  position integer not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  quantity_hundredths integer not null default 100 check (quantity_hundredths > 0 and quantity_hundredths <= 100000000),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint generated always as ((unit_price_cents * quantity_hundredths + 50) / 100) stored,
  optional boolean not null default false,       -- add-on the client may choose when accepting
  foreign key (organization_id, version_id) references public.proposal_versions (organization_id, id) on delete cascade
);
create index proposal_items_version_idx on public.proposal_items (version_id, position);

create table public.proposal_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_id uuid not null,
  position integer not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  percent_bps integer not null check (percent_bps between 1 and 10000),
  due text check (due is null or length(due) <= 200),        -- "On signing", "On delivery"…
  foreign key (organization_id, version_id) references public.proposal_versions (organization_id, id) on delete cascade
);
create index proposal_milestones_version_idx on public.proposal_payment_milestones (version_id, position);

-- Locked versions are immutable: no edits to content, items or schedule.
create function private.guard_locked_version() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_id uuid := coalesce(new.version_id, old.version_id);
  is_locked boolean;
begin
  select locked_at is not null into is_locked from public.proposal_versions where id = v_id;
  if is_locked then
    raise exception 'This proposal version was sent and can no longer change. Create a new revision.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger proposal_items_locked before insert or update or delete on public.proposal_items for each row execute function private.guard_locked_version();
create trigger proposal_milestones_locked before insert or update or delete on public.proposal_payment_milestones for each row execute function private.guard_locked_version();

create function private.guard_version_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.locked_at is not null and (
    new.content is distinct from old.content or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.currency is distinct from old.currency or new.valid_until is distinct from old.valid_until
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'This proposal version was sent and can no longer change. Create a new revision.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger proposal_versions_locked before update on public.proposal_versions for each row execute function private.guard_version_update();

-- ── Share links and responses ───────────────────────────────────────────────

create table public.proposal_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_id uuid not null,
  token text not null unique check (length(token) >= 32),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, version_id) references public.proposal_versions (organization_id, id) on delete cascade
);

create table public.proposal_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_id uuid not null unique,               -- one response per version
  decision text not null check (decision in ('accepted', 'declined')),
  signer_name text not null check (length(btrim(signer_name)) between 1 and 160),
  signer_email text not null check (signer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  signer_title text check (signer_title is null or length(signer_title) <= 120),
  decline_reason text check (decline_reason is null or length(decline_reason) <= 2000),
  selected_optional_item_ids uuid[] not null default '{}',
  subtotal_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  content_hash text not null,                    -- sha256 of exactly what was shown
  user_agent text check (user_agent is null or length(user_agent) <= 500),
  ip_address text check (ip_address is null or length(ip_address) <= 64),
  responded_at timestamptz not null default now(),
  foreign key (organization_id, version_id) references public.proposal_versions (organization_id, id) on delete cascade
);

-- ── Shared helpers ──────────────────────────────────────────────────────────

create trigger proposals_updated_at before update on public.proposals for each row execute function private.set_updated_at();
create trigger proposal_versions_updated_at before update on public.proposal_versions for each row execute function private.set_updated_at();
create trigger proposals_keep_org before update on public.proposals for each row execute function private.keep_organization();
create trigger proposal_versions_keep_org before update on public.proposal_versions for each row execute function private.keep_organization();
create trigger proposals_audit after insert or update or delete on public.proposals for each row execute function private.audit();
create trigger proposal_versions_audit after insert or update or delete on public.proposal_versions for each row execute function private.audit();
create trigger proposal_responses_audit after insert on public.proposal_responses for each row execute function private.audit();

-- The public view of a version: what the client sees, and what the content hash covers.
create function private.public_proposal(v_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'number', p.number,
    'title', p.title,
    'language', p.language,
    'client_name', c.name,
    'organization_name', o.name,
    'version', v.version,
    'status', v.status,
    'currency', v.currency,
    'tax_rate_bps', v.tax_rate_bps,
    'valid_until', v.valid_until,
    'sent_at', v.sent_at,
    'content', v.content,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'description', i.description, 'quantity_hundredths', i.quantity_hundredths,
                                          'unit_price_cents', i.unit_price_cents, 'line_total_cents', i.line_total_cents, 'optional', i.optional) order by i.position)
      from public.proposal_items i where i.version_id = v.id), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object('label', m.label, 'percent_bps', m.percent_bps, 'due', m.due) order by m.position)
      from public.proposal_payment_milestones m where m.version_id = v.id), '[]'::jsonb)
  )
  from public.proposal_versions v
  join public.proposals p on p.id = v.proposal_id
  join public.clients c on c.id = p.client_id
  join public.organizations o on o.id = p.organization_id
  where v.id = v_id;
$$;

create function private.valid_share_link(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.version_id from public.proposal_share_links l
  where l.token = p_token and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())
    and length(p_token) between 32 and 128;
$$;

-- ── Client-facing functions (callable without login) ────────────────────────

create function public.get_shared_proposal(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := private.valid_share_link(p_token);
  r public.proposal_responses;
begin
  if v_id is null then
    return null;
  end if;
  select * into r from public.proposal_responses where version_id = v_id;
  return private.public_proposal(v_id) || jsonb_build_object(
    'response', case when r.id is null then null else jsonb_build_object(
      'decision', r.decision, 'signer_name', r.signer_name, 'responded_at', r.responded_at,
      'selected_optional_item_ids', to_jsonb(r.selected_optional_item_ids),
      'subtotal_cents', r.subtotal_cents, 'tax_cents', r.tax_cents, 'total_cents', r.total_cents) end
  );
end;
$$;

create function public.mark_shared_proposal_viewed(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.valid_share_link(p_token);
begin
  if v_id is null then return; end if;
  update public.proposal_versions set first_viewed_at = coalesce(first_viewed_at, now()),
    status = case when status = 'sent' then 'viewed'::public.proposal_status else status end
  where id = v_id;
  update public.proposals p set status = 'viewed'
  from public.proposal_versions v where v.id = v_id and p.id = v.proposal_id and p.status = 'sent';
end;
$$;

-- Accept or decline. Accepting converts the proposal (once): project, project finances, partner
-- origination split, deal → won, client → active. Everything happens in this one transaction.
create function public.respond_to_shared_proposal(
  p_token text,
  p_decision text,
  p_signer_name text,
  p_signer_email text,
  p_signer_title text default null,
  p_decline_reason text default null,
  p_selected_optional uuid[] default '{}',
  p_user_agent text default null,
  p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := private.valid_share_link(p_token);
  v public.proposal_versions;
  p public.proposals;
  d public.opportunities;
  existing public.proposal_responses;
  snapshot jsonb;
  subtotal bigint;
  tax bigint;
  new_project uuid;
  won_stage uuid;
  owner uuid;
begin
  if v_id is null then
    raise exception 'This link is invalid or has expired.' using errcode = '22023';
  end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  select * into v from public.proposal_versions where id = v_id for update;
  select * into p from public.proposals where id = v.proposal_id for update;

  select * into existing from public.proposal_responses where version_id = v_id;
  if existing.id is not null then
    return jsonb_build_object('decision', existing.decision, 'already', true);
  end if;
  if v.status not in ('sent', 'viewed') then
    raise exception 'This proposal can no longer be answered.' using errcode = '22023';
  end if;
  if v.valid_until is not null and v.valid_until < current_date then
    update public.proposal_versions set status = 'expired' where id = v_id;
    update public.proposals set status = 'expired' where id = p.id;
    raise exception 'This proposal has expired.' using errcode = '22023';
  end if;

  -- Only this version's optional items can be chosen.
  p_selected_optional := coalesce(array(
    select i.id from public.proposal_items i where i.version_id = v_id and i.optional and i.id = any (coalesce(p_selected_optional, '{}'))
  ), '{}');
  select coalesce(sum(line_total_cents), 0) into subtotal from public.proposal_items
  where version_id = v_id and (not optional or id = any (p_selected_optional));
  tax := (subtotal * v.tax_rate_bps + 5000) / 10000;
  snapshot := private.public_proposal(v_id) - 'status';

  insert into public.proposal_responses (organization_id, version_id, decision, signer_name, signer_email, signer_title, decline_reason,
    selected_optional_item_ids, subtotal_cents, tax_cents, total_cents, content_hash, user_agent, ip_address)
  values (v.organization_id, v_id, p_decision, btrim(p_signer_name), lower(btrim(p_signer_email)), nullif(btrim(coalesce(p_signer_title, '')), ''),
    nullif(btrim(coalesce(p_decline_reason, '')), ''),
    case when p_decision = 'accepted' then p_selected_optional else '{}' end,
    case when p_decision = 'accepted' then subtotal end, case when p_decision = 'accepted' then tax end,
    case when p_decision = 'accepted' then subtotal + tax end,
    encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'), left(p_user_agent, 500), left(p_ip, 64));

  update public.proposal_versions set status = p_decision::public.proposal_status, responded_at = now() where id = v_id;
  update public.proposals set status = p_decision::public.proposal_status where id = p.id;

  if p_decision = 'declined' then
    if p.opportunity_id is not null then
      insert into public.activities (organization_id, client_id, opportunity_id, kind, body)
      values (p.organization_id, p.client_id, p.opportunity_id, 'note',
              format('Proposal P-%s v%s declined by %s.%s', lpad(p.number::text, 4, '0'), v.version, btrim(p_signer_name),
                     case when coalesce(btrim(p_decline_reason), '') <> '' then ' Reason: ' || btrim(p_decline_reason) else '' end));
    end if;
    return jsonb_build_object('decision', 'declined');
  end if;

  -- ── Conversion (accepted) ──
  if p.opportunity_id is not null then
    select * into d from public.opportunities where id = p.opportunity_id for update;
  end if;
  owner := coalesce(d.owner_id, (select m.user_id from public.memberships m where m.organization_id = p.organization_id and m.user_id = p.created_by));

  if p.project_id is null then
    insert into public.projects (organization_id, client_id, name, status, owner_id, description, created_by)
    values (p.organization_id, p.client_id, p.title, 'planning', owner,
            format('From accepted proposal P-%s v%s.', lpad(p.number::text, 4, '0'), v.version), null)
    returning id into new_project;
    update public.proposals set project_id = new_project where id = p.id;
    if owner is not null then
      insert into public.project_members (organization_id, project_id, user_id) values (p.organization_id, new_project, owner) on conflict do nothing;
    end if;
  else
    new_project := p.project_id;
  end if;

  insert into public.project_finances (project_id, organization_id, currency, contract_cents, tax_rate_bps, collected_cents, outstanding_cents,
    as_of, source, notes)
  values (new_project, p.organization_id, v.currency, subtotal, v.tax_rate_bps, 0, subtotal + tax, current_date,
    format('Accepted proposal P-%s v%s', lpad(p.number::text, 4, '0'), v.version),
    (select 'Payment schedule: ' || string_agg(format('%s%% %s%s', trim_scale(m.percent_bps / 100.0)::text, m.label,
            case when m.due is not null then ' (' || m.due || ')' else '' end), '; ' order by m.position)
     from public.proposal_payment_milestones m where m.version_id = v_id))
  on conflict (project_id) do nothing;

  if d.id is not null and d.brought_by_kind = 'partner' and d.brought_by_partner_id is not null then
    insert into public.project_splits (organization_id, project_id, partner_id, role, share_bps)
    values (p.organization_id, new_project, d.brought_by_partner_id, 'origination', 10000)
    on conflict do nothing;
  end if;

  if d.id is not null then
    select s.id into won_stage from public.pipeline_stages s where s.organization_id = p.organization_id and s.kind = 'won' order by s.position limit 1;
    update public.opportunities set stage_id = coalesce(won_stage, stage_id), won_project_id = coalesce(won_project_id, new_project),
      value_cents = subtotal where id = d.id;
  end if;
  update public.clients set status = 'active' where id = p.client_id and status = 'prospect';

  return jsonb_build_object('decision', 'accepted', 'total_cents', subtotal + tax);
end;
$$;

revoke all on function public.get_shared_proposal(text), public.mark_shared_proposal_viewed(text),
  public.respond_to_shared_proposal(text, text, text, text, text, text, uuid[], text, text) from public;
grant execute on function public.get_shared_proposal(text), public.mark_shared_proposal_viewed(text),
  public.respond_to_shared_proposal(text, text, text, text, text, text, uuid[], text, text) to anon, authenticated;
revoke all on function private.public_proposal(uuid), private.valid_share_link(text) from public;

-- ── Grants and RLS (internal users) ─────────────────────────────────────────

revoke all on table public.proposals, public.proposal_versions, public.proposal_items, public.proposal_payment_milestones,
  public.proposal_share_links, public.proposal_responses from anon, authenticated;
grant select, insert, update, delete on public.proposals, public.proposal_versions, public.proposal_items, public.proposal_payment_milestones to authenticated;
grant select, insert, update on public.proposal_share_links to authenticated;
grant select on public.proposal_responses to authenticated; -- written only by respond_to_shared_proposal

alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_payment_milestones enable row level security;
alter table public.proposal_share_links enable row level security;
alter table public.proposal_responses enable row level security;

create policy "sales roles read proposals" on public.proposals for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles write proposals" on public.proposals for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]) and created_by = (select auth.uid()));
create policy "sales roles update proposals" on public.proposals for update to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));
create policy "admins delete proposals" on public.proposals for delete to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "sales roles read versions" on public.proposal_versions for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles write versions" on public.proposal_versions for all to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));

create policy "sales roles read items" on public.proposal_items for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles write items" on public.proposal_items for all to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));

create policy "sales roles read milestones" on public.proposal_payment_milestones for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
create policy "sales roles write milestones" on public.proposal_payment_milestones for all to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));

create policy "sales roles manage share links" on public.proposal_share_links for all to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing']::public.org_role[]));

create policy "sales roles read responses" on public.proposal_responses for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
