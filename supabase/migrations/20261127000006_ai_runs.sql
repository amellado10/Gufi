-- AI usage log (AGENTS.md §6): every Claude call made by Güfi OS, with who, what for, model,
-- tokens, estimated cost and outcome. No prompt or output text is stored here.
-- People see their own runs; admins see everyone's. Rows can't be edited or deleted from the app.

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z0-9_.-]{2,60}$'),       -- e.g. 'proposal.draft'
  subject_type text check (subject_type is null or subject_type ~ '^[a-z_]{2,40}$'),
  subject_id uuid,
  model text not null check (length(model) <= 80),
  status text not null check (status in ('succeeded', 'failed', 'refused')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_microusd bigint check (cost_microusd is null or cost_microusd >= 0),  -- estimate, 1 = $0.000001
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text check (error is null or length(error) <= 500),
  request_id text check (request_id is null or length(request_id) <= 120),
  created_at timestamptz not null default now()
);
create index ai_runs_org_created_idx on public.ai_runs (organization_id, created_at desc);

revoke all on table public.ai_runs from anon, authenticated;
grant select, insert on public.ai_runs to authenticated;
alter table public.ai_runs enable row level security;

create policy "people read their own runs, admins read all" on public.ai_runs
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_org_role(organization_id, array['admin']::public.org_role[]));
create policy "members log their own runs" on public.ai_runs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.has_org_role(organization_id));
