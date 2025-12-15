// Analytics - Visitor Tracking
// This script tracks page views and stores them for admin dashboard statistics

const ANALYTICS_KEY = 'lottereal_analytics';

// Get or initialize analytics data
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

// Save analytics data
function saveAnalytics(data) {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
}

// Track a page visit
function trackVisit() {
    const analytics = getAnalytics();
    const now = new Date();

    // Check if we need to reset weekly counter
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

    // Add new visit
    const visit = {
        timestamp: now.toISOString(),
        page: window.location.pathname,
        referrer: document.referrer || 'direct',
        userAgent: navigator.userAgent
    };

    analytics.visits.push(visit);
    analytics.weeklyVisits = analytics.visits.length;

    saveAnalytics(analytics);

    // TODO: Send to Supabase for persistent storage
    // This will be implemented when backend is ready
    console.log('Visit tracked:', visit);
}

// Get weekly visitor count
function getWeeklyVisitors() {
    const analytics = getAnalytics();
    return analytics.weeklyVisits;
}

// Get visitor growth percentage
function getVisitorGrowth() {
    const analytics = getAnalytics();
    const now = new Date();

    // Get this week's visits
    const thisWeekVisits = analytics.visits.filter(visit => {
        const visitDate = new Date(visit.timestamp);
        return (now - visitDate) / (1000 * 60 * 60 * 24) < 7;
    }).length;

    // Get last week's visits (7-14 days ago)
    const lastWeekVisits = analytics.visits.filter(visit => {
        const visitDate = new Date(visit.timestamp);
        const daysAgo = (now - visitDate) / (1000 * 60 * 60 * 24);
        return daysAgo >= 7 && daysAgo < 14;
    }).length;

    if (lastWeekVisits === 0) return 0;

    const growth = ((thisWeekVisits - lastWeekVisits) / lastWeekVisits) * 100;
    return Math.round(growth * 10) / 10; // Round to 1 decimal
}

// Initialize tracking on page load
if (typeof window !== 'undefined') {
    // Only track on non-admin pages
    if (!window.location.pathname.includes('/admin/')) {
        trackVisit();
    }
}

// Export for use in admin dashboard
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getWeeklyVisitors, getVisitorGrowth, trackVisit };
}
