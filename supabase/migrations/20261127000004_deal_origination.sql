-- "Brought in by" on deals: a partner (gets the 15%), Güfi itself (paid media, website, inbound…;
-- the 15% stays with Güfi), or nobody. Null = not set yet.
-- Also: sales roles can read partner names to choose them on deals (pay stays admins-only).

create type public.origination_kind as enum ('partner', 'gufi', 'none');

alter table public.opportunities add column brought_by_kind public.origination_kind;
update public.opportunities set brought_by_kind = 'partner' where brought_by_partner_id is not null;
-- A partner is set exactly when the kind is 'partner' (written without NULL comparisons, which
-- would let a contradictory row through as "unknown").
alter table public.opportunities add constraint opportunities_brought_by_check check (
  (brought_by_kind is not distinct from 'partner') = (brought_by_partner_id is not null)
);

create policy "sales roles read partner names" on public.partners
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'project_manager', 'marketing', 'finance']::public.org_role[]));
