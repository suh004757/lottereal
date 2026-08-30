import { getSupabaseClient } from '../config/supabaseConfig.js';

const TABLE = 'family_listing_records';
const FIELDS = [
  'id',
  'alias_code',
  'neighborhood',
  'building_keyword',
  'unit_label',
  'transaction_type',
  'intake_year_month',
  'status',
  'price_summary',
  'floor_summary',
  'layout_summary',
  'move_in_summary',
  'assigned_to',
  'source_label',
  'staff_task',
  'internal_notes',
  'created_by',
  'created_at',
  'updated_at'
].join(',');

const PARSE_FIELDS = [
  'id',
  'record_id',
  'source_text',
  'suggestions',
  'reviewed_values',
  'parse_status',
  'parser_error',
  'claimed_at',
  'attempt_count',
  'created_by',
  'created_at',
  'updated_at'
].join(',');

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('가족 매물 원장에 연결할 수 없습니다.');
  return client;
}

export async function listFamilyListings() {
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .select(FIELDS)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listFamilyListingAliases() {
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .select('alias_code')
    .limit(1000);
  if (error) throw error;
  return (data || []).map((row) => row.alias_code).filter(Boolean);
}

export async function listFamilyListingEvents(recordId) {
  if (!recordId) throw new Error('이력을 확인할 매물이 없습니다.');
  const { data, error } = await requireClient()
    .from('family_listing_events')
    .select('id,record_id,event_type,status_from,status_to,created_at')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createFamilyListing(payload) {
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .insert([payload])
    .select(FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateFamilyListing(id, payload) {
  if (!id) throw new Error('수정할 매물을 확인할 수 없습니다.');
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .update(payload)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function createFamilyParseDraft(sourceText, recordId = null) {
  const source = String(sourceText ?? '');
  if (!source.trim()) throw new Error('정리할 매물 내용을 입력해 주세요.');
  const payload = { source_text: source };
  if (recordId) payload.record_id = recordId;
  const { data, error } = await requireClient()
    .from('family_listing_parse_reviews')
    .insert([payload])
    .select(PARSE_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function listFamilyParseDrafts() {
  const { data, error } = await requireClient()
    .from('family_listing_parse_reviews')
    .select(PARSE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function finalizeFamilyParseDraft(id, payload) {
  if (!id) throw new Error('확인할 자동 정리 초안이 없습니다.');
  const { data, error } = await requireClient()
    .rpc('finalize_family_listing_parse_review', {
      p_draft_id: id,
      p_payload: payload
    })
    .single();
  if (error) throw error;
  return data;
}
