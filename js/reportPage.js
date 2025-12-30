/**
 * Market Trend Report Page Controller - Supabase Integration
 * Loads report from Supabase and renders with interactive features
 */

import { getLatestReport, getReportBySlug, incrementReportViews } from './services/reportAdapter.js';

/**
 * HTML escape utility to prevent XSS
 * Escapes special HTML characters to prevent injection attacks
 * 
 * @param {string} unsafe - Unsafe string that may contain HTML
 * @returns {string} Escaped safe string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Get report slug from URL (if any)
const urlParams = new URLSearchParams(window.location.search);
const reportSlug = urlParams.get('slug');

let currentReport = null;

// Load and render report
async function loadReport() {
    try {
        // Fetch from Supabase
        if (reportSlug) {
            currentReport = await getReportBySlug(reportSlug);
        } else {
            currentReport = await getLatestReport();
        }

        if (!currentReport) {
            showError('리포트를 찾을 수 없습니다.');
            return;
        }

        // Increment view count (fire-and-forget with error logging)
        incrementReportViews(currentReport.slug).catch(err => {
            console.warn('[Analytics] Failed to increment view count:', err);
        });

        // Render report
        renderReport();
        renderMetadata();
        renderRevisions();
    } catch (error) {
        console.error('Error loading report:', error);
        showError('리포트를 불러오는 데 실패했습니다.');
    }
}

// Render report metadata
function renderMetadata() {
    document.getElementById('report-title').textContent = currentReport.title;
    document.getElementById('report-summary').textContent = currentReport.summary;

    const updatedDate = new Date(currentReport.updated_at);
    document.getElementById('report-updated').textContent =
        updatedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Render report content
function renderReport() {
    const contentDiv = document.getElementById('report-content');

    try {
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: true
        });

        const rawHtml = marked.parse(currentReport.report_md);
        // ✅ Sanitize HTML to prevent XSS
        const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
        contentDiv.innerHTML = safeHtml;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        contentDiv.innerHTML = '<p>리포트를 불러오는 데 실패했습니다.</p>';
    }
}

// Render revision history (mock for now - will need separate table)
function renderRevisions() {
    const listDiv = document.getElementById('revision-list');

    const updatedDate = new Date(currentReport.updated_at);
    const revisionHtml = `
    <div class="lr-revision-item">
      <div class="lr-revision-header">
        <span class="lr-revision-version">v1.0</span>
        <span class="lr-revision-date">${updatedDate.toLocaleDateString('ko-KR')}</span>
      </div>
      <p class="lr-revision-changes">리포트 발행</p>
      <span class="lr-revision-editor">작성자: 관리자</span>
    </div>
  `;

    listDiv.innerHTML = revisionHtml;
}

// Open evidence modal
window.openEvidence = function () {
    const evidence = currentReport.evidence_json || [];

    // ✅ Escape HTML to prevent XSS
    const sourcesHtml = evidence.map(source => `
    <div style="padding: 1rem; background: #f9fafb; border-radius: 0.5rem; margin-bottom: 1rem;">
      <strong style="color: #111827;">${escapeHtml(source.name)}</strong><br>
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; font-size: 0.875rem;">${escapeHtml(source.url)}</a><br>
      <span style="color: #6b7280; font-size: 0.875rem;">수집일: ${escapeHtml(source.fetchedAt)}</span><br>
      <span style="color: #6b7280; font-size: 0.875rem;">범위: ${escapeHtml(source.coverage)}</span>
    </div>
  `).join('');

    const modalContent = `
    <h4 style="margin-bottom: 1.5rem; color: #111827;">📚 데이터 출처</h4>
    <div style="margin-bottom: 2rem;">
      ${sourcesHtml || '<p style="color: #6b7280;">데이터 출처 정보가 없습니다.</p>'}
    </div>
    
    <h4 style="margin-bottom: 1rem; color: #111827;">📊 지표 산출 방법</h4>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem;">
      <thead>
        <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 0.75rem; text-align: left; font-weight: 600;">지표</th>
          <th style="padding: 0.75rem; text-align: left; font-weight: 600;">산출 방법</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">거래량 변화율</td>
          <td style="padding: 0.75rem; font-family: monospace; font-size: 0.875rem;">(당월 거래 건수 - 전월 거래 건수) / 전월 거래 건수 × 100</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">매매가 변화율</td>
          <td style="padding: 0.75rem; font-family: monospace; font-size: 0.875rem;">(당월 평균 평당가 - 전월 평균 평당가) / 전월 평균 평당가 × 100</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 0.75rem;">전세가율</td>
          <td style="padding: 0.75rem; font-family: monospace; font-size: 0.875rem;">전세가 / 매매가 × 100</td>
        </tr>
      </tbody>
    </table>
    
    <h4 style="margin-bottom: 1rem; color: #111827;">⚠️ 데이터 제한 사항</h4>
    <ul style="color: #6b7280; font-size: 0.875rem; line-height: 1.75; padding-left: 1.5rem;">
      <li>본 분석은 공개된 실거래 데이터만을 기반으로 하며, 미공개 거래 및 다운계약은 포함되지 않습니다.</li>
      <li>지역별 평균가 산출 시 특정 고가 또는 저가 거래가 평균에 영향을 미칠 수 있습니다.</li>
      <li>세부 단지별, 평형별, 층별 차이는 반영되지 않은 지역 전체 평균입니다.</li>
      <li>정책 변화 및 거시 경제 변수의 영향은 부분적으로만 반영되었습니다.</li>
      <li>미래 가격 변동을 예측하거나 보장하는 자료가 아닙니다.</li>
    </ul>
  `;

    document.getElementById('evidence-content').innerHTML = modalContent;
    document.getElementById('evidence-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
};

// Close evidence modal
window.closeEvidence = function () {
    document.getElementById('evidence-modal').style.display = 'none';
    document.body.style.overflow = '';
};

// Copy summary to clipboard
window.copySummary = function () {
    const updatedDate = new Date(currentReport.updated_at).toLocaleDateString('ko-KR');

    const summary = `${currentReport.title}

${currentReport.summary}

자세한 내용: https://lottes.co.kr/report.html

본 요약은 정보 제공 목적의 참고 자료이며, 투자 권유 또는 수익 보장과 무관합니다.
출처: 롯데부동산 시장 리포트 (${updatedDate})`;

    navigator.clipboard.writeText(summary).then(() => {
        showNotification('✓ 요약이 클립보드에 복사되었습니다');
    }).catch(err => {
        console.error('복사 실패:', err);
        showNotification('✗ 복사에 실패했습니다');
    });
};

// Show notification
function showNotification(message) {
    const notification = document.getElementById('copy-notification');
    notification.textContent = message;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Show error
function showError(message) {
    const contentDiv = document.getElementById('report-content');
    contentDiv.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 2rem;">${message}</p>`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadReport();

    // Close modal on outside click
    const modal = document.getElementById('evidence-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEvidence();
            }
        });
    }
});
