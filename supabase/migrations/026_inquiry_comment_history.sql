-- Private append-only timeline for staff notes on customer inquiries.
-- Deploy this additive migration before the dashboard reader/writer release.

begin;

create table if not exists public.inquiry_comments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  body text not null check (
    char_length(body) <= 1000
    and char_length(btrim(body)) >= 1
  ),
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists inquiry_comments_inquiry_created_idx
on public.inquiry_comments (inquiry_id, created_at, id);

alter table public.inquiry_comments enable row level security;

revoke all privileges on table public.inquiry_comments from public, anon, authenticated;
grant select, insert on table public.inquiry_comments to authenticated;
revoke all privileges on table public.inquiry_comments from service_role;
grant select on table public.inquiry_comments to service_role;

-- Browser authentication alone is insufficient: only JWTs carrying the
-- server-controlled admin app_metadata role may read this private timeline.
drop policy if exists inquiry_comments_admin_select on public.inquiry_comments;
create policy inquiry_comments_admin_select
on public.inquiry_comments
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- Keep authorship immutable and tied to the authenticated caller. No update or
-- delete policy/grant is provided, so comments remain an append-only history.
drop policy if exists inquiry_comments_admin_insert on public.inquiry_comments;
create policy inquiry_comments_admin_insert
on public.inquiry_comments
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and author_id = auth.uid()
);

comment on table public.inquiry_comments is
  'Private admin comments. Comments follow the parent inquiry retention lifecycle and are append-only until its scheduled privacy deletion; never public or analytics data.';

commit;
