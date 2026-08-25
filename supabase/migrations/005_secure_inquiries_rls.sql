-- Lock down customer inquiry data while preserving public form submission.
-- Safe to run repeatedly in the Supabase SQL Editor.

begin;

alter table public.inquiries enable row level security;

-- Remove legacy policies that let anon/public read every inquiry.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiries'
      and cmd in ('ALL', 'SELECT')
      and ('public' = any(roles) or 'anon' = any(roles))
  loop
    execute format('drop policy %I on public.inquiries', policy_record.policyname);
  end loop;
end
$$;

-- Table privileges are a second barrier even if a permissive policy is added later.
revoke all privileges on table public.inquiries from anon, public;
grant insert on table public.inquiries to anon;
grant select, insert, update, delete on table public.inquiries to authenticated;

drop policy if exists inquiries_public_insert on public.inquiries;
create policy inquiries_public_insert
on public.inquiries
for insert
to anon
with check (
  status = 'unread'
  and phone ~ '^[0-9+() -]{8,24}$'
  and octet_length(coalesce(name, '')) <= 200
  and octet_length(coalesce(email, '')) <= 320
  and octet_length(coalesce(listing_title, '')) <= 500
  and octet_length(coalesce(message, '')) <= 4000
  and octet_length(coalesce(metadata::text, '')) <= 4000
);

-- Existing Supabase Auth users remain able to operate the admin dashboard.
drop policy if exists inquiries_authenticated_manage on public.inquiries;
create policy inquiries_authenticated_manage
on public.inquiries
for all
to authenticated
using (true)
with check (true);

commit;
