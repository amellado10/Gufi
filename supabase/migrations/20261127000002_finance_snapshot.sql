-- Finance foundation: per-project contract figures, partners and the 15/60/25 split, partner
-- payouts, and imported financial snapshots.
--
-- QuickBooks Online (Gufi S.A.) is the accounting system of record. Nothing here is a ledger:
-- every figure carries its source and "as of" date, and the app labels it that way.
-- Money is integer cents (bigint) with an explicit ISO currency code.
--
-- Access:
--   project_finances ........ admin, finance, project_manager read; admin, finance write
--   partners / splits / payouts ... admins only (partner pay is sensitive)
--   financial_snapshots ..... admins; finance only for snapshots with audience 'finance'
--   team (design & development) sees none of it.

create type public.split_role as enum ('origination', 'delivery');

-- ── Project finances (one row per project) ──────────────────────────────────

create table public.project_finances (
  project_id uuid primary key,
  organization_id uuid not null,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  contract_cents bigint not null check (contract_cents >= 0),          -- before tax
  tax_rate_bps integer check (tax_rate_bps between 0 and 10000),       -- 700 = ITBMS 7%; null = not in source
  tax_cents bigint generated always as ((contract_cents * tax_rate_bps + 5000) / 10000) stored, -- half-up
  collected_cents bigint check (collected_cents >= 0),                 -- cash received incl. tax; null = not in source
  outstanding_cents bigint not null check (outstanding_cents >= 0),    -- still to collect incl. tax
  invoice_ref text check (invoice_ref is null or length(invoice_ref) <= 60),
  payment_due_date date,
  -- Split policy, in basis points of the contract (before tax). Company keeps the remainder.
  origination_bps integer not null default 1500 check (origination_bps between 0 and 10000),
  delivery_bps integer not null default 6000 check (delivery_bps between 0 and 10000),
  as_of date not null,
  source text not null check (length(source) between 1 and 300),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  check (origination_bps + delivery_bps <= 10000),
  -- When everything is known, outstanding must equal contract + tax − collected.
  check (
    tax_rate_bps is null or collected_cents is null
    or outstanding_cents = greatest(contract_cents + (contract_cents * tax_rate_bps + 5000) / 10000 - collected_cents, 0)
  )
);
create index project_finances_org_idx on public.project_finances (organization_id);

-- ── Partners and the split ──────────────────────────────────────────────────

-- People who share in project revenue. May exist before they have a Güfi OS account;
-- user_id links them once they're invited.
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index partners_org_name_uq on public.partners (organization_id, lower(btrim(full_name)));

-- Who shares each role on a project. share_bps splits the role's pool between people
-- (e.g. two people who both delivered: 5000 + 5000).
create table public.project_splits (
  organization_id uuid not null,
  project_id uuid not null,
  partner_id uuid not null,
  role public.split_role not null,
  share_bps integer not null check (share_bps between 1 and 10000),
  primary key (project_id, partner_id, role),
  foreign key (organization_id, project_id) references public.projects (organization_id, id) on delete cascade,
  foreign key (organization_id, partner_id) references public.partners (organization_id, id) on delete restrict
);

-- Shares of one role on one project can't exceed 100%.
create function private.check_split_total() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select sum(share_bps) from public.project_splits where project_id = new.project_id and role = new.role) > 10000 then
    raise exception 'shares for % on this project exceed 100%%', new.role using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger project_splits_total after insert or update on public.project_splits
  for each row execute function private.check_split_total();

-- Money actually paid to a partner (from QuickBooks / the bank).
create table public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  partner_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  paid_month date check (paid_month is null or extract(day from paid_month) = 1), -- month only; null = not in source
  description text not null check (length(description) between 1 and 300),
  source text not null check (length(source) between 1 and 300),
  import_key text check (import_key is null or import_key ~ '^[a-z0-9-]{3,80}$'), -- makes re-imports idempotent
  created_at timestamptz not null default now(),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id) on delete restrict,
  unique (organization_id, import_key)
);
create index partner_payouts_partner_idx on public.partner_payouts (partner_id);

-- ── Imported financial snapshots ────────────────────────────────────────────

-- A point-in-time report from the accounting system (e.g. the partners' summary built from
-- QuickBooks). `data` is validated by the app (src/features/finance/snapshot.ts); amounts are cents.
create table public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{3,80}$'),       -- stable id for re-imports
  title text not null check (length(title) between 1 and 200),
  basis text not null check (basis in ('accrual', 'cash')),
  period_start date not null,
  period_end date not null,
  reconciled_through date,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  source text not null check (length(source) between 1 and 300),
  -- 'finance': admins and finance; 'admins': admins only (e.g. partner pay).
  audience text not null default 'finance' check (audience in ('finance', 'admins')),
  data jsonb not null,
  imported_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  check (period_end >= period_start)
);

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger project_finances_updated_at before update on public.project_finances for each row execute function private.set_updated_at();
create trigger partners_updated_at before update on public.partners for each row execute function private.set_updated_at();
create trigger financial_snapshots_updated_at before update on public.financial_snapshots for each row execute function private.set_updated_at();

create trigger project_finances_keep_org before update on public.project_finances for each row execute function private.keep_organization();
create trigger partners_keep_org before update on public.partners for each row execute function private.keep_organization();

create trigger project_finances_audit after insert or update or delete on public.project_finances for each row execute function private.audit();
create trigger partners_audit after insert or update or delete on public.partners for each row execute function private.audit();
create trigger project_splits_audit after insert or update or delete on public.project_splits for each row execute function private.audit();
create trigger partner_payouts_audit after insert or update or delete on public.partner_payouts for each row execute function private.audit();

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on table
  public.project_finances, public.partners, public.project_splits, public.partner_payouts, public.financial_snapshots
from anon, authenticated;

grant select, insert, update, delete on public.project_finances, public.partners, public.project_splits, public.partner_payouts to authenticated;
grant select on public.financial_snapshots to authenticated; -- written only by the import script

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.project_finances enable row level security;
alter table public.partners enable row level security;
alter table public.project_splits enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.financial_snapshots enable row level security;

create policy "finance roles read project finances" on public.project_finances
  for select to authenticated
  using (private.has_org_role(organization_id, array['admin', 'finance', 'project_manager']::public.org_role[]));
create policy "admins and finance write project finances" on public.project_finances
  for all to authenticated
  using (private.has_org_role(organization_id, array['admin', 'finance']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin', 'finance']::public.org_role[]));

create policy "admins manage partners" on public.partners
  for all to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "admins manage splits" on public.project_splits
  for all to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "admins manage partner payouts" on public.partner_payouts
  for all to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy "admins read all snapshots, finance reads finance snapshots" on public.financial_snapshots
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or (audience = 'finance' and private.has_org_role(organization_id, array['finance']::public.org_role[]))
  );
