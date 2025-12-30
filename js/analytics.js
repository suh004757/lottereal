/**
 * Analytics.js - 방문자 추적 및 분석
 * 페이지 방문 데이터를 로컬 스토리지에 저장하고 관리자 대시보드에서 통계를 제공합니다.
 */

// 로컬 스토리지 키
const ANALYTICS_KEY = 'lottereal_analytics';

/**
 * 분석 데이터를 가져오거나 초기화합니다.
 * @returns {Object} 분석 데이터 객체
 */
function getAnalytics() {
    const stored = localStorage.getItem(ANALYTICS_KEY);
    if (stored) {
        return JSON.parse(stored);
    }

    return {
        visits: [],
        weeklyVisits: 0,
        lastWeekReset: new Date().toISOString()
    };
}

/**
 * 분석 데이터를 로컬 스토리지에 저장합니다.
 * @param {Object} data - 저장할 분석 데이터
 */
function saveAnalytics(data) {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
}

/**
 * 페이지 방문을 추적하고 기록합니다.
 */
function trackVisit() {
    const analytics = getAnalytics();
    const now = new Date();

    // 주간 카운터 리셋 필요 여부 확인
    const lastReset = new Date(analytics.lastWeekReset);
    const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);

    if (daysSinceReset >= 7) {
        analytics.weeklyVisits = 0;
        analytics.lastWeekReset = now.toISOString();
        analytics.visits = analytics.visits.filter(visit => {
            const visitDate = new Date(visit.timestamp);
            return (now - visitDate) / (1000 * 60 * 60 * 24) < 7;
        });
    }

    // 새로운 방문 추가
    const visit = {
        timestamp: now.toISOString(),
        page: window.location.pathname,
        referrer: document.referrer || 'direct',
        userAgent: navigator.userAgent
    };

    analytics.visits.push(visit);
    analytics.weeklyVisits = analytics.visits.length;

    saveAnalytics(analytics);

    // TODO: Supabase에 영구 저장으로 전송 (백엔드 준비 시 구현)
    console.log('Visit tracked:', visit);
}

/**
 * 주간 방문자 수를 반환합니다.
 * @returns {number} 주간 방문자 수
 */
function getWeeklyVisitors() {
    const analytics = getAnalytics();
    return analytics.weeklyVisits;
}

/**
 * 방문자 증가율을 계산하여 반환합니다.
 * @returns {number} 증가율 (소수점 첫째자리까지)
 */
function getVisitorGrowth() {
    const analytics = getAnalytics();
    const now = new Date();

    // 이번 주 방문 수
    const thisWeekVisits = analytics.visits.filter(visit => {
        const visitDate = new Date(visit.timestamp);
        return (now - visitDate) / (1000 * 60 * 60 * 24) < 7;
    }).length;

    // 지난 주 방문 수 (7-14일 전)
    const lastWeekVisits = analytics.visits.filter(visit => {
        const visitDate = new Date(visit.timestamp);
        const daysAgo = (now - visitDate) / (1000 * 60 * 60 * 24);
        return daysAgo >= 7 && daysAgo < 14;
    }).length;

    if (lastWeekVisits === 0) return 0;

    const growth = ((thisWeekVisits - lastWeekVisits) / lastWeekVisits) * 100;
    return Math.round(growth * 10) / 10; // 소수점 첫째자리까지 반올림
}

// 페이지 로드 시 추적 초기화
if (typeof window !== 'undefined') {
    // 관리자 페이지에서는 추적하지 않음
    if (!window.location.pathname.includes('/admin/')) {
        trackVisit();
    }
}

// 관리자 대시보드에서 사용할 함수들 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getWeeklyVisitors, getVisitorGrowth, trackVisit };
}
