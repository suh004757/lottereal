-- Non-destructive free-text parsing drafts for the private family ledger.
-- Model suggestions never update canonical records directly. A family member must
-- review the draft, then one RPC atomically saves the record and closes the draft.

begin;

create table if not exists public.family_listing_parse_reviews (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.family_listing_records(id),
  source_text text not null
    check (char_length(source_text) between 1 and 10000),
  suggestions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(suggestions) = 'object'),
  reviewed_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reviewed_values) = 'object'),
  parse_status text not null default 'queued'
    check (parse_status in ('queued', 'processing', 'review_needed', 'reviewed', 'failed')),
  parser_error text not null default ''
    check (char_length(parser_error) <= 500),
  claimed_at timestamptz,
  attempt_count integer not null default 0
    check (attempt_count between 0 and 10),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.family_listing_parse_reviews enable row level security;

revoke all privileges on table public.family_listing_parse_reviews from anon, authenticated, public;
grant select, insert on table public.family_listing_parse_reviews to authenticated;
grant select, insert, update on table public.family_listing_parse_reviews to service_role;

drop policy if exists family_listing_parse_reviews_select on public.family_listing_parse_reviews;
create policy family_listing_parse_reviews_select
on public.family_listing_parse_reviews
for select
to authenticated
using (public.is_family_listing_member());

drop policy if exists family_listing_parse_reviews_insert on public.family_listing_parse_reviews;
create policy family_listing_parse_reviews_insert
on public.family_listing_parse_reviews
for insert
to authenticated
with check (
  public.is_family_listing_member()
  and created_by = auth.uid()
  and parse_status = 'queued'
  and suggestions = '{}'::jsonb
  and reviewed_values = '{}'::jsonb
  and parser_error = ''
  and claimed_at is null
  and attempt_count = 0
);

drop policy if exists family_listing_parse_reviews_update on public.family_listing_parse_reviews;

create or replace function public.guard_family_listing_parse_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_role text := coalesce(auth.role(), '');
begin
  if new.source_text is distinct from old.source_text then
    raise exception 'source_text cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'parse draft ownership cannot be changed';
  end if;

  if request_role = 'service_role' then
    if old.parse_status = 'queued' and new.parse_status = 'processing' then
      if new.suggestions is distinct from old.suggestions
         or new.reviewed_values is distinct from old.reviewed_values
         or new.record_id is distinct from old.record_id then
        raise exception 'claim may only change processing metadata';
      end if;
      new.claimed_at = now();
      new.attempt_count = old.attempt_count + 1;
      new.parser_error = '';
    elsif old.parse_status = 'processing' and new.parse_status = 'review_needed' then
      if new.suggestions = '{}'::jsonb
         or new.reviewed_values is distinct from old.reviewed_values
         or new.record_id is distinct from old.record_id then
        raise exception 'review suggestions are invalid';
      end if;
      new.claimed_at = null;
      new.parser_error = '';
    elsif old.parse_status = 'processing' and new.parse_status = 'failed' then
      new.claimed_at = null;
    elsif old.parse_status in ('processing', 'failed') and new.parse_status = 'queued' then
      if old.attempt_count >= 3 then
        raise exception 'parse retry limit reached';
      end if;
      new.claimed_at = null;
      new.parser_error = '';
    else
      raise exception 'invalid worker parse state transition';
    end if;
  elsif request_role = 'authenticated' then
    if not (old.parse_status = 'review_needed' and new.parse_status = 'reviewed') then
      raise exception 'invalid family parse state transition';
    end if;
    if new.record_id is null
       or new.suggestions is distinct from old.suggestions
       or new.parser_error is distinct from old.parser_error
       or new.claimed_at is distinct from old.claimed_at
       or new.attempt_count is distinct from old.attempt_count
       or new.reviewed_values = '{}'::jsonb then
      raise exception 'review completion payload is invalid';
    end if;
  else
    raise exception 'parse draft update is not allowed';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists family_listing_parse_reviews_guard on public.family_listing_parse_reviews;
create trigger family_listing_parse_reviews_guard
before update on public.family_listing_parse_reviews
for each row execute function public.guard_family_listing_parse_review();

create or replace function public.finalize_family_listing_parse_review(
  p_draft_id uuid,
  p_payload jsonb
)
returns public.family_listing_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.family_listing_parse_reviews%rowtype;
  saved public.family_listing_records%rowtype;
begin
  if not public.is_family_listing_member() then
    raise exception 'family membership required';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'reviewed payload must be an object';
  end if;

  select * into draft
  from public.family_listing_parse_reviews
  where id = p_draft_id
    and parse_status = 'review_needed'
  for update;

  if not found then
    raise exception 'review draft is unavailable';
  end if;

  if draft.record_id is null then
    insert into public.family_listing_records (
      alias_code, neighborhood, building_keyword, unit_label,
      transaction_type, intake_year_month, status, price_summary,
      floor_summary, layout_summary, move_in_summary, assigned_to,
      source_label, staff_task, internal_notes, created_by
    ) values (
      p_payload ->> 'alias_code',
      p_payload ->> 'neighborhood',
      p_payload ->> 'building_keyword',
      p_payload ->> 'unit_label',
      p_payload ->> 'transaction_type',
      p_payload ->> 'intake_year_month',
      coalesce(nullif(p_payload ->> 'status', ''), 'new'),
      coalesce(p_payload ->> 'price_summary', ''),
      coalesce(p_payload ->> 'floor_summary', ''),
      coalesce(p_payload ->> 'layout_summary', ''),
      coalesce(p_payload ->> 'move_in_summary', ''),
      coalesce(p_payload ->> 'assigned_to', ''),
      coalesce(p_payload ->> 'source_label', ''),
      coalesce(p_payload ->> 'staff_task', ''),
      coalesce(p_payload ->> 'internal_notes', ''),
      auth.uid()
    ) returning * into saved;
  else
    update public.family_listing_records
    set alias_code = p_payload ->> 'alias_code',
        neighborhood = p_payload ->> 'neighborhood',
        building_keyword = p_payload ->> 'building_keyword',
        unit_label = p_payload ->> 'unit_label',
        transaction_type = p_payload ->> 'transaction_type',
        intake_year_month = p_payload ->> 'intake_year_month',
        status = coalesce(nullif(p_payload ->> 'status', ''), 'new'),
        price_summary = coalesce(p_payload ->> 'price_summary', ''),
        floor_summary = coalesce(p_payload ->> 'floor_summary', ''),
        layout_summary = coalesce(p_payload ->> 'layout_summary', ''),
        move_in_summary = coalesce(p_payload ->> 'move_in_summary', ''),
        assigned_to = coalesce(p_payload ->> 'assigned_to', ''),
        source_label = coalesce(p_payload ->> 'source_label', ''),
        staff_task = coalesce(p_payload ->> 'staff_task', ''),
        internal_notes = coalesce(p_payload ->> 'internal_notes', '')
    where id = draft.record_id
    returning * into saved;
    if not found then
      raise exception 'linked family listing is unavailable';
    end if;
  end if;

  update public.family_listing_parse_reviews
  set record_id = saved.id,
      reviewed_values = p_payload,
      parse_status = 'reviewed'
  where id = draft.id;

  return saved;
end;
$$;

revoke all on function public.finalize_family_listing_parse_review(uuid, jsonb) from public, anon;
grant execute on function public.finalize_family_listing_parse_review(uuid, jsonb) to authenticated;

create index if not exists family_listing_parse_reviews_status_created_idx
on public.family_listing_parse_reviews (parse_status, created_at);

create index if not exists family_listing_parse_reviews_claimed_idx
on public.family_listing_parse_reviews (parse_status, claimed_at)
where parse_status = 'processing';

commit;
