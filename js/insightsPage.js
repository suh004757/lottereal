/**
 * Insights Page Controller - Mock Data Version
 * Handles the market insights landing page with Seoul real estate data
 */

// Mock data for Seoul regions
const MOCK_INSIGHTS = [
  {
    slug: 'gangnam-apt-trends',
    region: '강남구',
    propertyType: '아파트',
    title: '강남 아파트 시장은 어떻게 변하고 있나요?',
    summary: '강남구 주요 아파트 단지의 최근 3개월 실거래 데이터를 분석한 참고 자료입니다.',
    metrics: {
      priceChange: 2.3,
      transactionChange: -4.7,
      rentChange: 0.8
    },
    updatedAt: '최신'
  },
  {
    slug: 'songpa-apt-trends',
    region: '송파구',
    propertyType: '아파트',
    title: '송파 아파트 시장 동향은 어떤가요?',
    summary: '송파구 아파트 실거래 데이터 기반 시장 분석 참고 자료입니다.',
    metrics: {
      priceChange: 1.8,
      transactionChange: -2.3,
      rentChange: 1.2
    },
    updatedAt: '최신'
  },
  {
    slug: 'jamsil-apt-analysis',
    region: '잠실동',
    propertyType: '아파트',
    title: '잠실 아파트 가격 변화는?',
    summary: '잠실동 롯데월드타워 주변 아파트 시장 정보 참고 자료입니다.',
    metrics: {
      priceChange: 3.1,
      transactionChange: -1.5,
      rentChange: 0.3
    },
    updatedAt: '최신'
  },
  {
    slug: 'gangnam-officetel',
    region: '강남구',
    propertyType: '오피스텔',
    title: '강남 오피스텔 전월세 시장은?',
    summary: '강남구 오피스텔 임대 시장 동향 분석 참고 자료입니다.',
    metrics: {
      priceChange: 0.5,
      transactionChange: 2.1,
      rentChange: 1.8
    },
    updatedAt: '최신'
  },
  {
    slug: 'songpa-commercial',
    region: '송파구',
    propertyType: '상가',
    title: '송파 상권 임대료 변화는?',
    summary: '송파구 주요 상권 임대 시장 정보 참고 자료입니다.',
    metrics: {
      priceChange: -0.8,
      transactionChange: -5.2,
      rentChange: -1.3
    },
    updatedAt: '최신'
  },
  {
    slug: 'samsung-apt',
    region: '삼성동',
    propertyType: '아파트',
    title: '삼성동 아파트 시장 트렌드는?',
    summary: '삼성동 코엑스 주변 아파트 실거래 분석 참고 자료입니다.',
    metrics: {
      priceChange: 2.7,
      transactionChange: -3.8,
      rentChange: 1.5
    },
    updatedAt: '최신'
  }
];

// Format metric as chip HTML
function formatMetricChip(value, label) {
  const type = value > 0.5 ? 'positive' : value < -0.5 ? 'negative' : 'neutral';
  const sign = value > 0 ? '+' : '';
  return `
    <div class="lr-metric-chip lr-metric-chip--${type}">
      <span>${label}</span>
      <strong>${sign}${value.toFixed(1)}%</strong>
    </div>
  `;
}

// Render insight card
function renderInsightCard(insight) {
  return `
    <a href="insight-detail.html?slug=${insight.slug}" class="lr-insight-card">
      <div class="lr-insight-card__content">
        <p class="lr-kicker">${insight.region} · ${insight.propertyType}</p>
        <h4>${insight.title}</h4>
        <p class="lr-text">${insight.summary}</p>
        <div class="lr-metrics">
          ${formatMetricChip(insight.metrics.priceChange, '매매가')}
          ${formatMetricChip(insight.metrics.transactionChange, '거래량')}
          ${formatMetricChip(insight.metrics.rentChange, '전월세')}
        </div>
      </div>
      <div class="lr-insight-card__footer">
        <span class="lr-updated">업데이트: ${insight.updatedAt}</span>
        <button class="lr-btn lr-btn--ghost lr-btn--sm" onclick="event.preventDefault(); event.stopPropagation(); openEvidence('${insight.slug}')">근거 보기</button>
      </div>
    </a>
  `;
}

// Filter insights
function filterInsights() {
  const regionFilter = document.getElementById('filter-region').value;
  const typeFilter = document.getElementById('filter-type').value;

  let filtered = MOCK_INSIGHTS;

  if (regionFilter) {
    filtered = filtered.filter(i => i.slug.includes(regionFilter));
  }

  if (typeFilter) {
    const typeMap = {
      'apt': '아파트',
      'officetel': '오피스텔',
      'commercial': '상가',
      'office': '사무실'
    };
    filtered = filtered.filter(i => i.propertyType === typeMap[typeFilter]);
  }

  const grid = document.getElementById('insights-grid');
  grid.innerHTML = filtered.map(renderInsightCard).join('');
}

// Open evidence modal
window.openEvidence = function (slug) {
  const insight = MOCK_INSIGHTS.find(i => i.slug === slug) || MOCK_INSIGHTS[0];

  const modalContent = `
    <h4 style="margin-bottom: 1.5rem; color: #111827;">📊 주요 지표 산출 근거</h4>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
      <thead>
        <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 0.75rem; text-align: left; font-weight: 600;">지표</th>
          <th style="padding: 0.75rem; text-align: left; font-weight: 600;">값</th>
          <th style="padding: 0.75rem; text-align: left; font-weight: 600;">산출 기간</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">평균 매매가 변화</td>
          <td style="padding: 0.75rem; font-weight: 600; color: ${insight.metrics.priceChange > 0 ? '#059669' : '#dc2626'};">${insight.metrics.priceChange > 0 ? '+' : ''}${insight.metrics.priceChange}%</td>
          <td style="padding: 0.75rem;">최근 3개월</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">거래량 변화</td>
          <td style="padding: 0.75rem; font-weight: 600; color: ${insight.metrics.transactionChange > 0 ? '#059669' : '#dc2626'};">${insight.metrics.transactionChange > 0 ? '+' : ''}${insight.metrics.transactionChange}%</td>
          <td style="padding: 0.75rem;">전월 대비</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">전월세 비율 변화</td>
          <td style="padding: 0.75rem; font-weight: 600; color: ${insight.metrics.rentChange > 0 ? '#059669' : '#dc2626'};">${insight.metrics.rentChange > 0 ? '+' : ''}${insight.metrics.rentChange}%</td>
          <td style="padding: 0.75rem;">3개월 평균</td>
        </tr>
      </tbody>
    </table>
    
    <h4 style="margin-bottom: 1rem; color: #111827;">📚 데이터 출처</h4>
    <ul style="list-style: none; padding: 0; margin-bottom: 2rem;">
      <li style="padding: 0.5rem 0; border-bottom: 1px solid #f3f4f6;">
        <strong>국토교통부 실거래가 공개시스템</strong><br>
        <a href="https://rt.molit.go.kr" target="_blank" style="color: #3b82f6; font-size: 0.875rem;">https://rt.molit.go.kr</a><br>
        <span style="color: #6b7280; font-size: 0.875rem;">수집일: 최신</span>
      </li>
      <li style="padding: 0.5rem 0; border-bottom: 1px solid #f3f4f6;">
        <strong>서울시 부동산 정보광장</strong><br>
        <a href="https://land.seoul.go.kr" target="_blank" style="color: #3b82f6; font-size: 0.875rem;">https://land.seoul.go.kr</a><br>
        <span style="color: #6b7280; font-size: 0.875rem;">수집일: 최신</span>
      </li>
      <li style="padding: 0.5rem 0;">
        <strong>한국부동산원 통계정보</strong><br>
        <a href="https://www.reb.or.kr" target="_blank" style="color: #3b82f6; font-size: 0.875rem;">https://www.reb.or.kr</a><br>
        <span style="color: #6b7280; font-size: 0.875rem;">수집일: 최신</span>
      </li>
    </ul>
    
    <h4 style="margin-bottom: 1rem; color: #111827;">⚠️ 데이터 제한 사항</h4>
    <ul style="color: #6b7280; font-size: 0.875rem; line-height: 1.75;">
      <li>본 분석은 공개된 실거래 데이터만을 기반으로 하며, 미공개 거래는 포함되지 않습니다.</li>
      <li>특정 고가 또는 저가 거래가 평균에 영향을 미칠 수 있습니다.</li>
      <li>세부 단지별, 평형별 차이는 반영되지 않은 지역 전체 평균입니다.</li>
      <li>미래 가격 변동을 예측하는 자료가 아닙니다.</li>
    </ul>
  `;

  document.getElementById('evidence-content').innerHTML = modalContent;
  document.getElementById('evidence-modal').style.display = 'flex';

  // Prevent body scroll
  document.body.style.overflow = 'hidden';
};

// Close evidence modal
window.closeEvidence = function () {
  document.getElementById('evidence-modal').style.display = 'none';
  document.body.style.overflow = '';
};

// Close modal on outside click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('evidence-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeEvidence();
      }
    });
  }

  // Initialize grid
  filterInsights();

  // Add filter event listeners
  document.getElementById('filter-region').addEventListener('change', filterInsights);
  document.getElementById('filter-type').addEventListener('change', filterInsights);
  document.getElementById('filter-timeframe').addEventListener('change', filterInsights);
});
