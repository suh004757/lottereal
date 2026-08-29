import { getSupabaseClient } from '../config/supabaseConfig.js';

export async function saveAdminIntakeDraft(payload = {}) {
  if (payload.status !== 'draft') {
    throw new Error('초안 상태만 저장할 수 있습니다.');
  }
  if (payload.metadata?.intake_source !== 'admin-chat') {
    throw new Error('ADMIN 채팅 접수만 저장할 수 있습니다.');
  }
  if (payload.metadata?.publish_approved !== false) {
    throw new Error('공개 승인 전에는 저장할 수 없습니다.');
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('백엔드 연결이 없어 초안을 저장하지 못했습니다.');
  }

  const insertPayload = {
    slug: payload.slug,
    title: payload.title,
    summary: payload.summary,
    report_md: payload.report_md,
    evidence_json: Array.isArray(payload.evidence_json) ? payload.evidence_json : [],
    status: 'draft',
    metadata: {
      ...payload.metadata,
      intake_source: 'admin-chat',
      publish_approved: false
    },
    created_at: payload.created_at,
    updated_at: payload.updated_at,
    view_count: 0
  };

  const { data, error } = await supabase
    .from('market_reports')
    .insert([insertPayload])
    .select('id,slug,status,metadata,created_at')
    .single();

  if (error) throw error;
  if (!data?.id || data.status !== 'draft' || data.metadata?.publish_approved !== false) {
    throw new Error('백엔드의 비공개 초안 저장 결과를 확인하지 못했습니다.');
  }
  return data;
}
