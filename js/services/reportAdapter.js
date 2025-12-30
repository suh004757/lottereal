// ====================
// Market Reports API
// ====================

import { getSupabaseClient } from '../config/supabaseConfig.js';
import { APP_CONFIG } from '../config/appConfig.js';

/**
 * Get the latest published market report
 */
export async function getLatestReport() {
    const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
    if (provider === 'supabase') return getLatestReportSupabase();
    return getLatestReportMock();
}

/**
 * Get a specific report by slug
 */
export async function getReportBySlug(slug) {
    const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
    if (provider === 'supabase') return getReportBySlugSupabase(slug);
    return getLatestReportMock();
}

/**
 * Create or update a market report (Admin only)
 */
export async function saveReport(reportData) {
    const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
    if (provider === 'supabase') return saveReportSupabase(reportData);
    return saveReportMock(reportData);
}

/**
 * List all reports (Admin only)
 */
export async function listReports({ status, limit = 10 } = {}) {
    const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
    if (provider === 'supabase') return listReportsSupabase({ status, limit });
    return [getLatestReportMock()];
}

/**
 * Increment report view count
 */
export async function incrementReportViews(slug) {
    const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
    if (provider === 'supabase') return incrementReportViewsSupabase(slug);
}

// Supabase implementations
async function getLatestReportSupabase() {
    const supabase = getSupabaseClient();
    if (!supabase) return getLatestReportMock();

    const { data, error } = await supabase
        .from('market_reports')
        .select('*')
        .eq('status', 'published')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error('Supabase getLatestReport error', error);
        return null;
    }
    return data;
}

async function getReportBySlugSupabase(slug) {
    const supabase = getSupabaseClient();
    if (!supabase) return getLatestReportMock();

    const { data, error } = await supabase
        .from('market_reports')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (error) {
        console.error('Supabase getReportBySlug error', error);
        return null;
    }
    return data;
}

async function saveReportSupabase(reportData) {
    const supabase = getSupabaseClient();
    if (!supabase) return saveReportMock(reportData);

    const payload = {
        slug: reportData.slug,
        title: reportData.title,
        summary: reportData.summary,
        report_md: reportData.content,
        evidence_json: reportData.evidence,
        status: reportData.status || 'draft'
    };

    // Check if report exists
    const { data: existing } = await supabase
        .from('market_reports')
        .select('id')
        .eq('slug', reportData.slug)
        .single();

    let result;
    if (existing) {
        // Update
        const { data, error } = await supabase
            .from('market_reports')
            .update(payload)
            .eq('slug', reportData.slug)
            .select()
            .single();

        if (error) throw error;
        result = data;
    } else {
        // Insert
        const { data, error } = await supabase
            .from('market_reports')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;
        result = data;
    }

    return result;
}

async function listReportsSupabase({ status, limit }) {
    const supabase = getSupabaseClient();
    if (!supabase) return [getLatestReportMock()];

    let query = supabase
        .from('market_reports')
        .select('id, slug, title, summary, status, updated_at, view_count')
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
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

// Mock implementations
function getLatestReportMock() {
    const SAMPLE_MD = `## 1. 거시 환경 (Macro)

### 금리 및 정책 동향

최근 3개월간 한국은행 기준금리는 **3.50%에서 동결**된 상태를 유지하고 있습니다. 미국 연준의 추가 긴축 가능성은 낮아졌으나, 국내 물가 안정세가 확인되기 전까지는 금리 인하 시기가 불명확한 상황으로 관찰됩니다.

정부의 주택 공급 확대 정책은 지속되고 있으며, 특히 **수도권 3기 신도시** 및 **재건축 규제 완화** 논의가 활발합니다. 다만 이러한 정책이 실질적인 공급 증가로 이어지기까지는 시차가 존재할 것으로 예상됩니다.

### 신용 및 대출 환경

주택담보대출(주담대) 금리는 평균 **연 4.5~5.5%** 수준으로, 전월 대비 소폭 하락한 것으로 나타났습니다. 총부채원리금상환비율(DSR) 규제가 지속 적용되고 있어, 고가 주택 구매자의 자금 조달 부담은 여전히 높은 수준입니다.

전세자금대출 수요는 계절적 요인(연말 이사 시즌)으로 증가했으나, 금리 부담으로 인해 월세 전환 비율도 함께 증가하는 추세가 관찰되었습니다.

---

## 2. 수요 및 공급 (Demand/Supply)

### 거래량 동향

서울 전체 아파트 거래량은 전월 대비 **약 3.2% 감소**한 것으로 집계되었습니다. 이는 계절적 요인(연말 거래 비수기)과 함께, 매수자들의 관망세가 지속되고 있음을 시사합니다.

지역별로는:
- **강남구**: -4.7% (전월 대비)
- **송파구**: -2.3%
- **서초구**: -3.8%
- **마포구**: +1.2% (소폭 증가)

강남 3구의 거래량 감소가 두드러지는 반면, 일부 비강남 지역(마포, 용산 등)에서는 소폭 증가세가 관찰되었습니다.

### 공급 신호

신규 분양 물량은 전분기 대비 **약 15% 증가**했으나, 청약 경쟁률은 평균 **3:1 수준**으로 이전 대비 낮아진 것으로 나타났습니다. 특히 비강남권 신규 분양의 미달 사례가 일부 발생하며, 시장의 선별적 수요 패턴이 확인되고 있습니다.

재건축·재개발 단지의 조합원 분양가는 일부 지역에서 상승했으나, 일반 분양가와의 격차 확대로 인해 프리미엄 부담이 증가하고 있는 상황입니다.

---

## 3. 가격 동향 (Price Action)

### 핵심 지역 (Core)

강남, 송파, 서초 등 **핵심 지역의 매매가는 약 1.8~2.3% 상승**한 것으로 관찰되었습니다. 다만 이는 일부 고가 단지의 거래 영향이 크며, 중저가 단지는 보합세를 유지하고 있습니다.

- **잠실 주공5단지**: 평당 약 7,500만원 수준 (전월 대비 +2.1%)
- **대치동 은마아파트**: 평당 약 8,200만원 수준 (전월 대비 +1.9%)
- **서초 래미안**: 평당 약 7,800만원 수준 (전월 대비 +2.5%)

전세가율(전세가/매매가)은 평균 **65~70%** 수준을 유지하고 있으나, 일부 신축 단지에서는 80%를 상회하는 사례도 확인되어 전세 수요의 강세를 시사합니다.

### 비핵심 지역 (Non-Core)

비강남권(양천, 강서, 강북 등)의 매매가는 **보합 또는 소폭 하락(-0.5~0.8%)**한 것으로 나타났습니다. 신규 공급 물량 증가와 수요 집중도 저하가 주요 원인으로 분석됩니다.

오피스텔 및 상가의 경우, 임대 수요 감소로 인해 **공실률이 증가**하고 있으며, 일부 지역에서는 임대료 할인 협상 사례가 늘어나고 있습니다.

---

## 4. 리스크 관찰 (Risk Watchlist)

### 단기 리스크

1. **금리 추가 인상 가능성**: 현재는 낮으나, 인플레이션 재발 시 추가 긴축 가능성 존재
2. **전세 사기 우려**: 깡통 전세 및 역전세 리스크가 일부 구축 단지에서 관찰됨
3. **공급 과잉 우려**: 3기 신도시 및 대규모 재건축 완공 시 공급 과잉 가능성

### 중장기 리스크

1. **인구 감소 및 고령화**: 장기 수요 기반 약화 가능성
2. **정책 변동성**: 정부 정책 변화에 따른 시장 변동성 증가
3. **글로벌 경기 침체**: 수출 감소 → 소득 감소 → 주택 수요 위축 시나리오

---

## 5. 주목할 신호 (What to Watch Next)

### 1~2월 관찰 포인트

- **한국은행 금통위 결과** (1월 하순): 금리 동결 또는 인하 여부
- **정부 주택 공급 정책 발표**: 규제 완화 범위 및 시행 시기
- **신규 분양 청약 경쟁률**: 시장 심리 및 수요 강도 확인
- **전세 → 월세 전환율**: 임대 시장 구조 변화 속도
- **미국 연준 통화정책**: 달러 강세 여부 및 국내 금리 영향

### 데이터 수집 계획

다음 리포트(2월 중순 예정)에서는 아래 데이터를 추가 반영할 예정입니다:
- 1월 실거래가 확정 데이터
- 주요 단지별 세부 가격 변동 추이
- 지역별 공실률 및 임대료 변화

---

## 마무리

본 리포트는 2024년 10월부터 12월까지의 서울 부동산 시장 데이터를 종합한 참고 자료입니다. 
시장은 **금리 동결 장기화**, **선별적 수요 지속**, **핵심 지역 선호 강화** 등의 패턴을 보이고 있으나, 
향후 정책 변화 및 거시 경제 환경에 따라 빠르게 변동할 수 있습니다.

**실제 거래 결정 시에는 반드시 개별 단지 현황, 재무 상태, 전문가 상담을 종합적으로 고려해야 합니다.**
`;

    return {
        id: 'mock-1',
        slug: '2025-01-market-report',
        title: '2025년 1월 서울 부동산 시장 트렌드 리포트',
        summary: '서울 주요 지역의 실거래 데이터, 정책 변화, 시장 신호를 종합 분석한 참고 자료입니다.',
        report_md: SAMPLE_MD,
        evidence_json: [
            {
                name: '국토교통부 실거래가 공개시스템',
                url: 'https://rt.molit.go.kr',
                fetchedAt: '2025-01-15',
                coverage: '서울 전역 아파트 실거래 데이터 (2024년 10월~12월)'
            },
            {
                name: '서울시 부동산 정보광장',
                url: 'https://land.seoul.go.kr',
                fetchedAt: '2025-01-15',
                coverage: '지역별 공급 물량, 청약 경쟁률 데이터'
            },
            {
                name: '한국부동산원 통계정보',
                url: 'https://www.reb.or.kr',
                fetchedAt: '2025-01-14',
                coverage: '전국 아파트 가격 동향, 전세가율 데이터'
            },
            {
                name: '한국은행 경제통계시스템',
                url: 'https://ecos.bok.or.kr',
                fetchedAt: '2025-01-14',
                coverage: '기준금리, 주담대 금리 데이터'
            }
        ],
        status: 'published',
        updated_at: '2025-01-15T00:00:00Z',
        view_count: 0
    };
}

function saveReportMock(reportData) {
    console.log('[Mock Backend] saveReport', reportData);
    return {
        id: 'mock-' + Date.now(),
        ...reportData,
        updated_at: new Date().toISOString()
    };
}
