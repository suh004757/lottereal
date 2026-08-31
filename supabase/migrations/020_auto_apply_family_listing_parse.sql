-- Atomically apply high-confidence, non-sensitive parser output to placeholder
-- or empty family listing fields. Exact source text remains immutable.

begin;

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
    elsif old.parse_status = 'processing' and new.parse_status = 'reviewed' then
      if jsonb_typeof(new.suggestions) is distinct from 'object'
         or jsonb_typeof(new.reviewed_values) is distinct from 'object'
         or new.record_id is null
         or new.record_id is distinct from old.record_id then
        raise exception 'automatic parse completion is invalid';
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

create or replace function public.auto_apply_family_listing_parse(
  p_draft_id uuid,
  p_suggestions jsonb
)
returns public.family_listing_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.family_listing_parse_reviews%rowtype;
  current_record public.family_listing_records%rowtype;
  saved public.family_listing_records%rowtype;
  item record;
  values_json jsonb := '{}'::jsonb;
  applied jsonb := '{}'::jsonb;
  value_text text;
  max_length integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if jsonb_typeof(p_suggestions) is distinct from 'object' then
    raise exception 'suggestions must be an object';
  end if;

  select * into draft
  from public.family_listing_parse_reviews
  where id = p_draft_id
    and parse_status = 'processing'
  for update;
  if not found or draft.record_id is null then
    raise exception 'processing draft is unavailable';
  end if;

  select * into current_record
  from public.family_listing_records
  where id = draft.record_id
  for update;
  if not found then
    raise exception 'family listing is unavailable';
  end if;

  for item in select key, value from jsonb_each(p_suggestions)
  loop
    if item.key <> all (array[
      'neighborhood', 'building_keyword', 'unit_label', 'transaction_type',
      'price_summary', 'floor_summary', 'layout_summary', 'move_in_summary'
    ]) then
      raise exception 'unsupported automatic field';
    end if;
    if jsonb_typeof(item.value) is distinct from 'object'
       or jsonb_typeof(item.value -> 'value') is distinct from 'string'
       or jsonb_typeof(item.value -> 'confidence') is distinct from 'number' then
      raise exception 'invalid automatic suggestion';
    end if;
    if (item.value ->> 'confidence')::numeric < 0.8
       or (item.value ->> 'confidence')::numeric > 1 then
      raise exception 'automatic confidence is out of range';
    end if;

    value_text := btrim(item.value ->> 'value');
    max_length := case item.key
      when 'neighborhood' then 40
      when 'building_keyword' then 80
      when 'unit_label' then 40
      when 'transaction_type' then 20
      when 'price_summary' then 120
      when 'floor_summary' then 60
      when 'layout_summary' then 80
      when 'move_in_summary' then 80
    end;
    if value_text = '' or char_length(value_text) > max_length
       or value_text ~ E'[\r\n\t]' then
      raise exception 'automatic value is invalid';
    end if;
    if item.key = 'transaction_type'
       and value_text <> all (array['매매', '전세', '월세', '임대', '기타']) then
      raise exception 'automatic transaction type is invalid';
    end if;
    if value_text ~ '(^|[^0-9])0(2|1[016789]|[3-6][1-5])[- .]?[0-9]{3,4}[- .]?[0-9]{4}([^0-9]|$)'
       or value_text ~ '(^|[^0-9])[0-9]{6}[- ]?[1-8][0-9]{6}([^0-9]|$)' then
      raise exception 'sensitive automatic value is not allowed';
    end if;
    values_json := values_json || jsonb_build_object(item.key, value_text);
  end loop;

  if (current_record.neighborhood in ('위치확인') and values_json ? 'neighborhood')
     or (current_record.building_keyword in ('건물확인') and values_json ? 'building_keyword')
     or (current_record.unit_label in ('호수확인') and values_json ? 'unit_label')
     or (current_record.transaction_type = '기타' and values_json ? 'transaction_type')
     or (btrim(current_record.price_summary) = '' and values_json ? 'price_summary')
     or (btrim(current_record.floor_summary) = '' and values_json ? 'floor_summary')
     or (btrim(current_record.layout_summary) = '' and values_json ? 'layout_summary')
     or (btrim(current_record.move_in_summary) = '' and values_json ? 'move_in_summary') then
    update public.family_listing_records
  set neighborhood = case
        when current_record.neighborhood in ('위치확인') and values_json ? 'neighborhood'
          then values_json ->> 'neighborhood' else current_record.neighborhood end,
      building_keyword = case
        when current_record.building_keyword in ('건물확인') and values_json ? 'building_keyword'
          then values_json ->> 'building_keyword' else current_record.building_keyword end,
      unit_label = case
        when current_record.unit_label in ('호수확인') and values_json ? 'unit_label'
          then values_json ->> 'unit_label' else current_record.unit_label end,
      transaction_type = case
        when current_record.transaction_type = '기타' and values_json ? 'transaction_type'
          then values_json ->> 'transaction_type' else current_record.transaction_type end,
      price_summary = case
        when btrim(current_record.price_summary) = '' and values_json ? 'price_summary'
          then values_json ->> 'price_summary' else current_record.price_summary end,
      floor_summary = case
        when btrim(current_record.floor_summary) = '' and values_json ? 'floor_summary'
          then values_json ->> 'floor_summary' else current_record.floor_summary end,
      layout_summary = case
        when btrim(current_record.layout_summary) = '' and values_json ? 'layout_summary'
          then values_json ->> 'layout_summary' else current_record.layout_summary end,
      move_in_summary = case
        when btrim(current_record.move_in_summary) = '' and values_json ? 'move_in_summary'
          then values_json ->> 'move_in_summary' else current_record.move_in_summary end
  where id = current_record.id
    returning * into saved;
  else
    saved := current_record;
  end if;

  if saved.neighborhood is distinct from current_record.neighborhood then
    applied := applied || jsonb_build_object('neighborhood', saved.neighborhood);
  end if;
  if saved.building_keyword is distinct from current_record.building_keyword then
    applied := applied || jsonb_build_object('building_keyword', saved.building_keyword);
  end if;
  if saved.unit_label is distinct from current_record.unit_label then
    applied := applied || jsonb_build_object('unit_label', saved.unit_label);
  end if;
  if saved.transaction_type is distinct from current_record.transaction_type then
    applied := applied || jsonb_build_object('transaction_type', saved.transaction_type);
  end if;
  if saved.price_summary is distinct from current_record.price_summary then
    applied := applied || jsonb_build_object('price_summary', saved.price_summary);
  end if;
  if saved.floor_summary is distinct from current_record.floor_summary then
    applied := applied || jsonb_build_object('floor_summary', saved.floor_summary);
  end if;
  if saved.layout_summary is distinct from current_record.layout_summary then
    applied := applied || jsonb_build_object('layout_summary', saved.layout_summary);
  end if;
  if saved.move_in_summary is distinct from current_record.move_in_summary then
    applied := applied || jsonb_build_object('move_in_summary', saved.move_in_summary);
  end if;

  update public.family_listing_parse_reviews
  set suggestions = p_suggestions,
      reviewed_values = applied,
      parse_status = 'reviewed',
      parser_error = '',
      claimed_at = null
  where id = draft.id;

  return saved;
end;
$$;

revoke all on function public.auto_apply_family_listing_parse(uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.auto_apply_family_listing_parse(uuid, jsonb)
to service_role;

commit;
