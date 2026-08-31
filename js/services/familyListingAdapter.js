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
  if (!client) throw new Error('매물 목록에 연결할 수 없습니다.');
  return client;
}

function chunkValues(values, size = 100) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export async function listFamilyListings() {
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .select(FIELDS)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getFamilyListingMembership(userId) {
  if (!userId) throw new Error('사용자 권한을 확인할 수 없습니다.');
  const { data, error } = await requireClient()
    .from('family_listing_members')
    .select('family_role,display_name')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function listFamilyListingPhotoBatches(recordIds = []) {
  const ids = Array.from(new Set(recordIds.map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return [];
  const pages = await Promise.all(chunkValues(ids).map(async (chunk) => {
    const { data, error } = await requireClient()
      .from('market_reports')
      .select('id,metadata,created_at')
      .eq('status', 'draft')
      .eq('metadata->>intake_type', 'listing')
      .eq('metadata->>photo_upload_state', 'complete')
      .in('metadata->>family_listing_id', chunk)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }));
  return pages.flat().sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
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

export async function createFamilyListing(payload, options = {}) {
  const recordId = String(options.id || '').trim();
  const insertPayload = recordId ? { ...payload, id: recordId } : payload;
  const { data, error } = await requireClient()
    .from('family_listing_records')
    .insert([insertPayload])
    .select(FIELDS)
    .single();
  if (error && recordId) {
    const { data: existing, error: readError } = await requireClient()
      .from('family_listing_records')
      .select(FIELDS)
      .eq('id', recordId)
      .maybeSingle();
    if (!readError && existing) return existing;
  }
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

export async function archiveFamilyListingAsOwner(id) {
  if (!id) throw new Error('삭제할 매물을 확인할 수 없습니다.');
  const { data, error } = await requireClient()
    .rpc('archive_family_listing_as_owner', { p_record_id: id })
    .single();
  if (error) throw error;
  return data;
}

export async function createFamilyParseDraft(sourceText, recordId = null, options = {}) {
  const source = String(sourceText ?? '');
  if (!source.trim()) throw new Error('정리할 매물 내용을 입력해 주세요.');
  const draftId = String(options.id || '').trim();
  const payload = { source_text: source };
  if (draftId) payload.id = draftId;
  if (recordId) payload.record_id = recordId;
  const { data, error } = await requireClient()
    .from('family_listing_parse_reviews')
    .insert([payload])
    .select(PARSE_FIELDS)
    .single();
  if (error && draftId) {
    const { data: existing, error: readError } = await requireClient()
      .from('family_listing_parse_reviews')
      .select(PARSE_FIELDS)
      .eq('id', draftId)
      .maybeSingle();
    if (!readError && existing) return existing;
  }
  if (error) throw error;
  return data;
}

export async function listFamilyParseDrafts(recordIds = []) {
  const ids = Array.from(new Set(recordIds.map((value) => String(value || '').trim()).filter(Boolean)));
  if (ids.length) {
    const pages = await Promise.all(chunkValues(ids).map(async (chunk) => {
      const { data, error } = await requireClient()
        .from('family_listing_parse_reviews')
        .select(PARSE_FIELDS)
        .in('record_id', chunk)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }));
    return pages.flat().sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  }
  const { data, error } = await requireClient()
    .from('family_listing_parse_reviews')
    .select(PARSE_FIELDS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function finalizeFamilyParseDraft(id, payload) {
  if (!id) throw new Error('확인할 내용이 없습니다.');
  const { data, error } = await requireClient()
    .rpc('finalize_family_listing_parse_review', {
      p_draft_id: id,
      p_payload: payload
    })
    .single();
  if (error) throw error;
  return data;
}
