import { getSupabaseClient } from '../config/supabaseConfig.js';
import { APP_CONFIG } from '../config/appConfig.js';

const VIEWED_REPORTS_KEY = 'lottereal:viewedReports';

const MOCK_REPORTS = [
  {
    id: 'mock-1',
    slug: '2026-03-seoul-market-report',
    title: '2026 3월 서울 부동산 시장 리포트',
    summary: '서울 주요 권역의 매매·임대 흐름과 거래량 변화를 정리한 최신 시장 브리프입니다.',
    report_md: `## 1. 시장 요약

- 서울 핵심 권역의 거래량은 전월 대비 완만한 회복세를 보였습니다.
- 강남권은 고가 거래 중심으로 가격 방어가 이어졌고, 비강남권은 지역별 편차가 확대됐습니다.

## 2. 수요와 공급

- 실거주 수요는 학군과 교통이 우수한 지역에 집중되고 있습니다.
- 신규 공급 일정이 가시화된 지역은 관망세가 나타났습니다.

## 3. 체크 포인트

- 금리 방향성
- 입주 물량
- 전세 수급 변화`,
    evidence_json: [
      {
        name: '국토교통부 실거래가 공개시스템',
        url: 'https://rt.molit.go.kr',
        fetchedAt: '2026-03-05',
        coverage: '서울 아파트 실거래가'
      }
    ],
    status: 'published',
    updated_at: '2026-03-05T03:00:00Z',
    created_at: '2026-03-05T03:00:00Z',
    view_count: 124,
    metadata: {
      evidenceCount: 1
    }
  },
  {
    id: 'mock-2',
    slug: '2026-02-seoul-market-report',
    title: '2026 2월 서울 부동산 시장 리포트',
    summary: '거래량, 전세가율, 공급 계획을 기준으로 서울 부동산 흐름을 정리했습니다.',
    report_md: `## 1. 거래 흐름

- 강동·송파 권역은 실수요 중심 거래가 유지됐습니다.
- 비핵심 권역은 매수 호가 조정이 이어졌습니다.`,
    evidence_json: [],
    status: 'published',
    updated_at: '2026-02-12T03:00:00Z',
    created_at: '2026-02-12T03:00:00Z',
    view_count: 89,
    metadata: null
  },
  {
    id: 'mock-3',
    slug: '2026-01-seoul-market-report',
    title: '2026 1월 서울 부동산 시장 리포트',
    summary: '연초 시장 심리와 권역별 가격 움직임을 중심으로 정리한 월간 리포트입니다.',
    report_md: `## 1. 연초 동향

- 연초 거래량은 전통적인 비수기 영향으로 제한적입니다.
- 핵심지 위주로 가격 방어가 관찰됩니다.`,
    evidence_json: [],
    status: 'published',
    updated_at: '2026-01-09T03:00:00Z',
    created_at: '2026-01-09T03:00:00Z',
    view_count: 61,
    metadata: null
  },
  {
    id: 'mock-4',
    slug: '2026-04-seoul-market-report-draft',
    title: '2026 4월 서울 부동산 시장 리포트 초안',
    summary: '발행 전 검토 중인 초안입니다.',
    report_md: `## Draft

발행 전 초안입니다.`,
    evidence_json: [],
    status: 'draft',
    updated_at: '2026-03-06T03:00:00Z',
    created_at: '2026-03-06T03:00:00Z',
    view_count: 0,
    metadata: null
  }
];

export async function getLatestReport() {
  const reports = await listPublishedReports({ limit: 1 });
  return reports[0] || null;
}

export async function getReportBySlug(slug) {
  const provider = getProvider();
  if (provider === 'supabase') return getReportBySlugSupabase(slug);
  return getReportBySlugMock(slug, { publishedOnly: true });
}

export async function getReportAdmin({ id, slug } = {}) {
  const provider = getProvider();
  if (provider === 'supabase') return getReportAdminSupabase({ id, slug });
  return getReportAdminMock({ id, slug });
}

export async function saveReport(reportData) {
  const provider = getProvider();
  if (provider === 'supabase') return saveReportSupabase(reportData);
  return saveReportMock(reportData);
}

export async function listReports({ status, limit = 10, excludeSlug } = {}) {
  const provider = getProvider();
  if (provider === 'supabase') return listReportsSupabase({ status, limit, excludeSlug });
  return listReportsMock({ status, limit, excludeSlug });
}

export async function listPublishedReports({ limit = 10, excludeSlug } = {}) {
  return listReports({ status: 'published', limit, excludeSlug });
}

export async function incrementReportViews(slug) {
  if (!slug || hasViewedInSession(slug)) return;

  const provider = getProvider();
  if (provider === 'supabase') {
    await incrementReportViewsSupabase(slug);
  }
  markViewedInSession(slug);
}

function getProvider() {
  return (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
}

function normalizeReportPayload(reportData = {}) {
  return {
    id: reportData.id,
    slug: reportData.slug,
    title: reportData.title,
    summary: reportData.summary ?? '',
    report_md: reportData.report_md ?? reportData.content ?? '',
    evidence_json: reportData.evidence_json ?? reportData.evidence ?? [],
    status: reportData.status || 'draft',
    metadata: reportData.metadata ?? null,
    created_at: reportData.created_at,
    updated_at: reportData.updated_at
  };
}

async function getReportBySlugSupabase(slug) {
  const supabase = getSupabaseClient();
  if (!supabase || !slug) return getReportBySlugMock(slug, { publishedOnly: true });

  const { data, error } = await supabase
    .from('market_reports')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('Supabase getReportBySlug error', error);
    return null;
  }
  return data || null;
}

async function getReportAdminSupabase({ id, slug } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || (!id && !slug)) return getReportAdminMock({ id, slug });

  let query = supabase.from('market_reports').select('*').limit(1);
  query = id ? query.eq('id', id) : query.eq('slug', slug);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('Supabase getReportAdmin error', error);
    return null;
  }
  return data || null;
}

async function saveReportSupabase(reportData) {
  const supabase = getSupabaseClient();
  const payload = normalizeReportPayload(reportData);
  if (!supabase) return saveReportMock(payload);

  const persistedPayload = {
    slug: payload.slug,
    title: payload.title,
    summary: payload.summary,
    report_md: payload.report_md,
    evidence_json: payload.evidence_json,
    status: payload.status,
    metadata: payload.metadata,
    updated_at: payload.updated_at || new Date().toISOString()
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('market_reports')
      .update(persistedPayload)
      .eq('id', payload.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const insertPayload = {
    ...persistedPayload,
    created_at: payload.created_at || new Date().toISOString(),
    view_count: 0
  };

  const { data, error } = await supabase
    .from('market_reports')
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listReportsSupabase({ status, limit, excludeSlug }) {
  const supabase = getSupabaseClient();
  if (!supabase) return listReportsMock({ status, limit, excludeSlug });

  let query = supabase
    .from('market_reports')
    .select('id, slug, title, summary, status, updated_at, created_at, view_count, metadata')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }
  if (excludeSlug) {
    query = query.neq('slug', excludeSlug);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Supabase listReports error', error);
    return [];
  }
  return data || [];
}

async function incrementReportViewsSupabase(slug) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.rpc('increment_report_view_count', {
    report_slug: slug
  });

  if (error) {
    console.error('Supabase incrementReportViews error', error);
  }
}

function listReportsMock({ status, limit = 10, excludeSlug } = {}) {
  let reports = [...MOCK_REPORTS];
  if (status) {
    reports = reports.filter((report) => report.status === status);
  }
  if (excludeSlug) {
    reports = reports.filter((report) => report.slug !== excludeSlug);
  }
  reports.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return reports.slice(0, limit).map(cloneReport);
}

function getReportBySlugMock(slug, { publishedOnly = false } = {}) {
  const report = MOCK_REPORTS.find((item) => item.slug === slug && (!publishedOnly || item.status === 'published'));
  return report ? cloneReport(report) : null;
}

function getReportAdminMock({ id, slug } = {}) {
  const report = MOCK_REPORTS.find((item) => (id && item.id === id) || (slug && item.slug === slug));
  return report ? cloneReport(report) : null;
}

function saveReportMock(reportData) {
  const payload = normalizeReportPayload(reportData);
  const timestamp = new Date().toISOString();
  if (payload.id) {
    return {
      ...cloneReport(payload),
      updated_at: timestamp
    };
  }
  return {
    ...cloneReport(payload),
    id: `mock-${Date.now()}`,
    created_at: timestamp,
    updated_at: timestamp,
    view_count: 0
  };
}

function hasViewedInSession(slug) {
  try {
    const viewed = JSON.parse(sessionStorage.getItem(VIEWED_REPORTS_KEY) || '[]');
    return Array.isArray(viewed) && viewed.includes(slug);
  } catch {
    return false;
  }
}

function markViewedInSession(slug) {
  try {
    const viewed = JSON.parse(sessionStorage.getItem(VIEWED_REPORTS_KEY) || '[]');
    const next = Array.isArray(viewed) ? viewed : [];
    if (!next.includes(slug)) {
      next.push(slug);
      sessionStorage.setItem(VIEWED_REPORTS_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore sessionStorage failures.
  }
}

function cloneReport(report) {
  return JSON.parse(JSON.stringify(report));
}
