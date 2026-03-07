import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';

const INSIGHTS = [
  {
    slug: 'gangnam-apt-trends',
    region: '강남구 · 아파트',
    title: '강남 아파트 시장은 어떻게 변하고 있나요?',
    summary: '강남구 아파트 최근 3개월 실거래와 전세 흐름을 요약한 시장 참고 자료입니다.',
    updatedAt: '2026-03-07',
    sourceCount: 3,
    metrics: {
      priceChange: 2.3,
      transactionChange: -4.7,
      rentChange: 0.8
    },
    series: {
      price: [98, 99, 101],
      transactions: [112, 106, 101],
      rent: [100, 100.4, 100.8]
    }
  },
  {
    slug: 'songpa-apt-trends',
    region: '송파구 · 아파트',
    title: '송파 아파트 시장은 어떻게 변하고 있나요?',
    summary: '송파구 아파트 가격과 거래량, 전월세 흐름을 정리한 시장 참고 자료입니다.',
    updatedAt: '2026-03-07',
    sourceCount: 3,
    metrics: {
      priceChange: 1.8,
      transactionChange: -2.3,
      rentChange: 1.2
    },
    series: {
      price: [99, 100, 101.8],
      transactions: [108, 106, 103.5],
      rent: [100, 100.6, 101.2]
    }
  },
  {
    slug: 'jamsil-apt-analysis',
    region: '잠실 · 아파트',
    title: '잠실 아파트 가격은 어떻게 변하고 있나요?',
    summary: '잠실 주요 단지의 가격·거래·전세 흐름을 요약한 참고 자료입니다.',
    updatedAt: '2026-03-07',
    sourceCount: 3,
    metrics: {
      priceChange: 3.1,
      transactionChange: -1.5,
      rentChange: 0.3
    },
    series: {
      price: [99, 101, 103.1],
      transactions: [104, 103, 102.5],
      rent: [100, 100.1, 100.3]
    }
  }
];

const params = new URLSearchParams(window.location.search);
const slug = params.get('slug');

document.addEventListener('DOMContentLoaded', () => {
  const insight = INSIGHTS.find((item) => item.slug === slug) || INSIGHTS[0];
  renderInsight(insight);
  renderCharts(insight);
  applySeo(insight);
  bindModal(insight);
});

function renderInsight(insight) {
  setText('breadcrumb-title', insight.title);
  setText('detail-region', insight.region);
  setText('detail-title', insight.title);
  setText('detail-summary', insight.summary);
  setText('detail-updated', `최종 업데이트: ${insight.updatedAt}`);
  setText('detail-source-count', `데이터 출처 ${insight.sourceCount}개`);
  setText('metric-price', formatPercent(insight.metrics.priceChange));
  setText('metric-transactions', formatPercent(insight.metrics.transactionChange));
  setText('metric-rent', formatPercent(insight.metrics.rentChange));
}

function renderCharts(insight) {
  if (!window.Chart) return;

  createLineChart('chart-price', insight.series.price, '#d97706');
  createLineChart('chart-transactions', insight.series.transactions, '#1f2937');
  createLineChart('chart-rent', insight.series.rent, '#2563eb');
}

function createLineChart(id, data, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  // Destroy existing chart instance if the page is reinitialized.
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
  }

  canvas._chartInstance = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: ['M-2', 'M-1', 'Current'],
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: `${color}22`,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function bindModal(insight) {
  const modal = document.getElementById('evidence-modal');
  if (!modal) return;

  window.openEvidence = function openEvidence() {
    const content = document.getElementById('evidence-content');
    if (content) {
      content.innerHTML = `
        <h4 style="margin-bottom: 1rem; color: #111827;">Data Sources</h4>
        <ul style="padding-left: 1rem; color: #4b5563; line-height: 1.8;">
          <li>국토교통부 실거래가 공개시스템</li>
          <li>서울부동산정보광장</li>
          <li>한국부동산원 공개 통계</li>
        </ul>
        <p style="margin-top: 1rem; color: #6b7280;">현재 문서는 ${insight.region} 시장 참고 자료이며 투자 권유가 아닙니다.</p>
      `;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.closeEvidence = function closeEvidence() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      window.closeEvidence();
    }
  });
}

function applySeo(insight) {
  const canonical = buildAbsoluteUrl(`insight-detail.html?slug=${encodeURIComponent(insight.slug)}`);
  const title = `${insight.title} | Lotte Real Estate`;
  const description = insight.summary;
  const image = buildAbsoluteUrl('img/bg-img/lotte_street_view.png');

  updateSeoMeta({
    title,
    description,
    canonical,
    ogImage: image,
    type: 'article',
    locale: 'ko_KR',
    siteName: 'Lotte Real Estate'
  });

  renderJsonLd({
    id: 'insight-breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: buildAbsoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Insights', item: buildAbsoluteUrl('/insights.html') },
        { '@type': 'ListItem', position: 3, name: insight.title, item: canonical }
      ]
    }
  });

  renderJsonLd({
    id: 'insight-article',
    data: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: insight.title,
      description,
      inLanguage: 'ko-KR',
      dateModified: insight.updatedAt,
      mainEntityOfPage: canonical,
      image: [image],
      author: {
        '@type': 'Organization',
        name: 'Lotte Real Estate'
      },
      publisher: {
        '@type': 'Organization',
        name: 'Lotte Real Estate',
        logo: {
          '@type': 'ImageObject',
          url: image
        }
      }
    }
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}
