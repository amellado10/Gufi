-- Fix: deleting an organization failed, because cascaded deletes (memberships, stages…) tried to
-- write audit entries for the organization being deleted. The audit trigger now skips rows whose
-- organization no longer exists; that organization's audit log is deleted with it anyway.

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  diff jsonb;
  k text;
  org uuid;
begin
  org := coalesce(row_new ->> 'organization_id', row_old ->> 'organization_id', row_new ->> 'id', row_old ->> 'id')::uuid;
  -- The organization itself is being deleted (cascade): its whole history goes with it.
  if not exists (select 1 from public.organizations where id = org) then
    return coalesce(new, old);
  end if;
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
    org,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_new ->> 'id', row_old ->> 'id', row_new ->> 'project_id', row_old ->> 'project_id'),
    case tg_op when 'INSERT' then row_new when 'UPDATE' then diff else row_old end
  );
  return coalesce(new, old);
end;
$$;
