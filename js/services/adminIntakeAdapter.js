import { getSupabaseClient } from '../config/supabaseConfig.js';
import { isFinalizedImageManifest, isCompatibleImageManifest } from '../adminIntakeImageRules.mjs';

export async function saveAdminIntakeDraft(payload = {}) {
  validateDraftPayload(payload);
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('백엔드 연결이 없어 초안을 저장하지 못했습니다.');
  }

  const insertPayload = {
    id: payload.id,
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
    .select('id,slug,title,summary,report_md,evidence_json,status,metadata,created_at,updated_at')
    .single();

  if (!error && isMatchingDraft(data, payload)) return data;

  // An insert can commit even when its HTTP response is lost. Exact-ID readback
  // makes a retry idempotent and prevents photos being attached to uncertainty.
  const existing = await readAdminIntakeDraft(payload.id, supabase).catch(() => null);
  if (isMatchingDraft(existing, payload)) return existing;
  if (error) throw error;
  throw new Error('백엔드의 비공개 초안 저장 결과를 확인하지 못했습니다.');
}

export async function finalizeAdminIntakeImages(reportId, paths) {
  const safePaths = Array.from(paths || []);
  if (!reportId || !safePaths.length || safePaths.length > 30) {
    throw new Error('사진 최종 저장 정보를 확인할 수 없습니다.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('백엔드 연결이 없어 사진을 확정하지 못했습니다.');

  const { data, error } = await supabase.rpc('finalize_admin_intake_images', {
    p_report_id: reportId,
    p_paths: safePaths
  });
  if (!error && data?.id === reportId && isFinalizedImageManifest(data.metadata, safePaths)) {
    return data;
  }

  // The RPC may have committed before a timeout. Never delete images based on
  // an ambiguous response; confirm the exact draft state instead.
  const existing = await readAdminIntakeDraft(reportId, supabase).catch(() => null);
  if (existing?.id === reportId && isFinalizedImageManifest(existing.metadata, safePaths)) {
    return existing;
  }
  if (error) throw error;
  throw new Error('사진 첨부 상태를 확인하지 못했습니다. 초안은 보존되며 재확인이 필요합니다.');
}

export async function readAdminIntakeDraft(reportId, client = getSupabaseClient()) {
  if (!reportId || !client) return null;
  const { data, error } = await client
    .from('market_reports')
    .select('id,slug,title,summary,report_md,evidence_json,status,metadata,created_at,updated_at')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function validateDraftPayload(payload) {
  if (!payload.id) throw new Error('초안 식별자를 확인할 수 없습니다.');
  if (payload.status !== 'draft') throw new Error('초안 상태만 저장할 수 있습니다.');
  if (payload.metadata?.intake_source !== 'admin-chat') throw new Error('ADMIN 채팅 접수만 저장할 수 있습니다.');
  if (payload.metadata?.publish_approved !== false) throw new Error('공개 승인 전에는 저장할 수 없습니다.');
}

function isMatchingDraft(data, payload) {
  return Boolean(
    data?.id === payload.id
    && data?.slug === payload.slug
    && data?.title === payload.title
    && data?.summary === payload.summary
    && data?.report_md === payload.report_md
    && JSON.stringify(data?.evidence_json || []) === JSON.stringify(payload.evidence_json || [])
    && data?.status === 'draft'
    && data?.metadata?.intake_source === 'admin-chat'
    && data?.metadata?.publish_approved === false
    && data?.metadata?.submitted_by === payload.metadata?.submitted_by
    && isCompatibleImageManifest(data?.metadata, payload.metadata)
  );
}
