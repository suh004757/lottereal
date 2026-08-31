-- Private family listing ledger. Exact unit details and internal notes must never
-- be copied to public.property_listings without an explicit sanitized publish step.

begin;

create table if not exists public.family_listing_members (
  user_id uuid primary key references auth.users(id),
  family_role text not null
    check (family_role in ('owner', 'spouse', 'daughter')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (family_role)
);

alter table public.family_listing_members enable row level security;
revoke all privileges on table public.family_listing_members from anon, authenticated, public;
grant select on table public.family_listing_members to authenticated;

create or replace function public.is_family_listing_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.family_listing_members where user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_listing_member() from public, anon;
grant execute on function public.is_family_listing_member() to authenticated;

drop policy if exists family_listing_members_self_select on public.family_listing_members;
create policy family_listing_members_self_select
on public.family_listing_members
for select
to authenticated
using (public.is_family_listing_member());

insert into public.family_listing_members (user_id, family_role, display_name)
select id, 'owner', '기존 관리자'
from auth.users
where raw_app_meta_data ->> 'role' = 'admin'
order by created_at
limit 1
on conflict do nothing;

create table if not exists public.family_listing_records (
  id uuid primary key default gen_random_uuid(),
  alias_code text not null unique check (char_length(alias_code) between 3 and 100),
  neighborhood text not null check (char_length(neighborhood) between 1 and 40),
  building_keyword text not null check (char_length(building_keyword) between 1 and 80),
  unit_label text not null check (char_length(unit_label) between 1 and 40),
  transaction_type text not null check (transaction_type in ('매매', '전세', '월세', '임대', '기타')),
  intake_year_month text not null check (intake_year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'new'
    check (status in ('new', 'needs_info', 'ready', 'advertising', 'inquiry', 'visit', 'contract', 'completed', 'hold', 'closed')),
  price_summary text not null default '' check (char_length(price_summary) <= 120),
  floor_summary text not null default '' check (char_length(floor_summary) <= 60),
  layout_summary text not null default '' check (char_length(layout_summary) <= 80),
  move_in_summary text not null default '' check (char_length(move_in_summary) <= 80),
  assigned_to text not null default '' check (char_length(assigned_to) <= 60),
  source_label text not null default '' check (char_length(source_label) <= 60),
  staff_task text not null default '' check (char_length(staff_task) <= 240),
  internal_notes text not null default '' check (char_length(internal_notes) <= 1000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.family_listing_records enable row level security;

revoke all privileges on table public.family_listing_records from anon, authenticated, public;
grant select, insert, update on table public.family_listing_records to authenticated;

drop policy if exists family_listing_records_admin_select on public.family_listing_records;
drop policy if exists family_listing_records_admin_insert on public.family_listing_records;
drop policy if exists family_listing_records_admin_update on public.family_listing_records;

create policy family_listing_records_admin_select
on public.family_listing_records
for select
to authenticated
using (public.is_family_listing_member());

create policy family_listing_records_admin_insert
on public.family_listing_records
for insert
to authenticated
with check (
  public.is_family_listing_member()
  and created_by = auth.uid()
);

create policy family_listing_records_admin_update
on public.family_listing_records
for update
to authenticated
using (public.is_family_listing_member())
with check (public.is_family_listing_member());

create table if not exists public.family_listing_events (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.family_listing_records(id),
  event_type text not null check (event_type in ('created', 'updated', 'status_changed')),
  status_from text,
  status_to text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.family_listing_events enable row level security;
revoke all privileges on table public.family_listing_events from anon, authenticated, public;
grant select on table public.family_listing_events to authenticated;

drop policy if exists family_listing_events_admin_select on public.family_listing_events;
create policy family_listing_events_admin_select
on public.family_listing_events
for select
to authenticated
using (public.is_family_listing_member());

create or replace function public.log_family_listing_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.family_listing_events (record_id, event_type, status_to, created_by)
    values (new.id, 'created', new.status, new.created_by);
  elsif old.status is distinct from new.status then
    insert into public.family_listing_events (record_id, event_type, status_from, status_to, created_by)
    values (new.id, 'status_changed', old.status, new.status, auth.uid());
  else
    insert into public.family_listing_events (record_id, event_type, status_from, status_to, created_by)
    values (new.id, 'updated', old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.log_family_listing_event() from public, anon, authenticated;

drop trigger if exists family_listing_records_log_event on public.family_listing_records;
create trigger family_listing_records_log_event
after insert or update on public.family_listing_records
for each row execute function public.log_family_listing_event();

create or replace function public.touch_family_listing_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists family_listing_records_touch_updated_at on public.family_listing_records;
create trigger family_listing_records_touch_updated_at
before update on public.family_listing_records
for each row execute function public.touch_family_listing_record();

commit;
