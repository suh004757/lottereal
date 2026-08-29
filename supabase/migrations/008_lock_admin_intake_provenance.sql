-- Preserve ADMIN-chat provenance using OLD-row-aware enforcement.
-- Reviewed public content must be created as a separate ordinary report rather
-- than converting the private raw intake row in place.

begin;

create or replace function public.enforce_admin_intake_provenance()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.metadata ->> 'intake_source' = 'admin-chat' then
    if new.metadata ->> 'intake_source' is distinct from 'admin-chat'
      or new.status is distinct from 'draft'
      or new.metadata ->> 'publish_approved' is distinct from 'false'
    then
      raise exception 'ADMIN intake provenance and private draft state are immutable'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_admin_intake_provenance() from public;
grant execute on function public.enforce_admin_intake_provenance() to authenticated, service_role;

drop trigger if exists market_reports_lock_admin_intake_provenance
on public.market_reports;

create trigger market_reports_lock_admin_intake_provenance
before update on public.market_reports
for each row
execute function public.enforce_admin_intake_provenance();

commit;
