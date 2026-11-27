-- Custom splits per project. Only the 15% for whoever brought the client is fixed; the rest of the
-- contract is split per project between the people who did the work, and Güfi keeps what's left.
--
-- Each split line is now a percentage OF THE CONTRACT (basis points: 3000 = 30%), instead of a share
-- of a fixed 60% "delivery" pool. Existing lines are converted exactly (e.g. 50% of the 60% pool →
-- 30% of the contract), so no amount changes. The fixed 15/60 columns on project_finances go away.

alter table public.project_splits add column percent_bps integer;

update public.project_splits s
set percent_bps = ((case s.role when 'origination' then f.origination_bps else f.delivery_bps end)::bigint * s.share_bps + 5000) / 10000
from public.project_finances f
where f.project_id = s.project_id;

update public.project_splits
set percent_bps = ((case role when 'origination' then 1500 else 6000 end)::bigint * share_bps + 5000) / 10000
where percent_bps is null;

alter table public.project_splits
  alter column percent_bps set not null,
  add constraint project_splits_percent_bps_check check (percent_bps between 1 and 10000);

drop trigger project_splits_total on public.project_splits;
drop function private.check_split_total();
alter table public.project_splits drop column share_bps;
alter table public.project_finances drop column origination_bps, drop column delivery_bps;

-- Per project: whoever brought the client gets at most 15% in total, and all lines together can't
-- exceed 100% of the contract (Güfi keeps the remainder).
create function private.check_project_split() returns trigger
language plpgsql set search_path = '' as $$
declare
  total integer;
  origination integer;
begin
  select coalesce(sum(percent_bps), 0), coalesce(sum(percent_bps) filter (where role = 'origination'), 0)
  into total, origination
  from public.project_splits where project_id = new.project_id;
  if origination > 1500 then
    raise exception 'Whoever brought the client gets 15%%, not more.' using errcode = '23514';
  end if;
  if total > 10000 then
    raise exception 'The split adds up to more than 100%% of the contract.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger project_splits_check after insert or update on public.project_splits
  for each row execute function private.check_project_split();

-- Accepting a proposal gives the deal's partner the fixed 15% (was: 100% of a 15% pool).
create or replace function public.respond_to_shared_proposal(
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
    insert into public.project_splits (organization_id, project_id, partner_id, role, percent_bps)
    values (p.organization_id, new_project, d.brought_by_partner_id, 'origination', 1500)
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
