// Availability math for short-term listings. A period covers starts_on..ends_on inclusive
// (ends_on is the last leased day), so the next move-in date is the day after it.
// Dates are plain 'YYYY-MM-DD' strings in Seoul time; arithmetic runs on UTC day numbers.

const DAY_MS = 86400000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDayNumber(value) {
  const match = ISO_DATE.exec(String(value || ''));
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

export function fromDayNumber(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function seoulToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function normalizePeriods(periods) {
  return (Array.isArray(periods) ? periods : [])
    .map((period) => ({ start: toDayNumber(period?.starts_on), end: toDayNumber(period?.ends_on) }))
    .filter((period) => period.start !== null && period.end !== null && period.end >= period.start)
    .sort((a, b) => a.start - b.start);
}

export function isDayBlocked(day, periods) {
  return normalizePeriods(periods).some((period) => day >= period.start && day <= period.end);
}

export function nextAvailableDate(periods, today) {
  const ranges = normalizePeriods(periods);
  let day = toDayNumber(today);
  if (day === null) return null;
  // Ranges are sorted by start, so one pass skips back-to-back and overlapping leases.
  for (const range of ranges) {
    if (range.start <= day && range.end >= day) day = range.end + 1;
  }
  return fromDayNumber(day);
}

export function buildMonthGrid(year, monthIndex, periods, today) {
  const ranges = normalizePeriods(periods);
  const todayDay = toDayNumber(today);
  const first = Date.UTC(year, monthIndex, 1) / DAY_MS;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leading = new Date(first * DAY_MS).getUTCDay();
  const cells = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let offset = 0; offset < daysInMonth; offset += 1) {
    const day = first + offset;
    cells.push({
      date: fromDayNumber(day),
      dayOfMonth: offset + 1,
      blocked: ranges.some((range) => day >= range.start && day <= range.end),
      past: todayDay !== null && day < todayDay,
      today: day === todayDay
    });
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year, monthIndex, weeks };
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COPY = {
  ko: {
    now: { long: '즉시입주', short: '즉시입주', badge: '즉시입주', inline: '즉시입주' },
    from: {
      long: (y, m, d) => `${y}년 ${m}월 ${d}일부터 입주 가능`,
      short: (y, m, d) => `${m}월 ${d}일부터 입주 가능`,
      badge: (y, m, d) => `${m}월 ${d}일부터 입주 가능`,
      inline: (y, m, d) => `${y}년 ${m}월 ${d}일부터 입주 가능`
    },
    month: (y, m) => `${y}년 ${m}월`,
    weekdays: ['일', '월', '화', '수', '목', '금', '토'],
    legend: { open: '입주 가능', blocked: '계약됨' }
  },
  en: {
    now: { long: 'Available for immediate move-in', short: 'available now', badge: 'Available now', inline: 'immediate move-in' },
    from: {
      long: (y, m, d) => `Available for move-in from ${MONTHS_EN[m - 1]} ${d}, ${y}`,
      short: (y, m, d) => `available from ${MONTHS_EN[m - 1]} ${d}`,
      badge: (y, m, d) => `Available from ${MONTHS_EN[m - 1].slice(0, 3)} ${d}`,
      inline: (y, m, d) => `move-in from ${MONTHS_EN[m - 1]} ${d}, ${y}`
    },
    month: (y, m) => `${MONTHS_EN[m - 1]} ${y}`,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    legend: { open: 'Available', blocked: 'Leased' }
  },
  ja: {
    now: { long: '即時入居可', short: '即時入居可', badge: '即時入居可', inline: '即時入居可' },
    from: {
      long: (y, m, d) => `${y}年${m}月${d}日から入居可`,
      short: (y, m, d) => `${m}月${d}日から入居可`,
      badge: (y, m, d) => `${m}月${d}日から入居可`,
      inline: (y, m, d) => `${y}年${m}月${d}日から入居可`
    },
    month: (y, m) => `${y}年${m}月`,
    weekdays: ['日', '月', '火', '水', '木', '金', '土'],
    legend: { open: '入居可', blocked: '契約済み' }
  }
};

export function calendarCopy(locale) {
  return COPY[locale] || COPY.ko;
}

export function formatAvailability(availableFrom, today, locale = 'ko', variant = 'long') {
  const copy = calendarCopy(locale);
  const fromDay = toDayNumber(availableFrom);
  const todayDay = toDayNumber(today);
  if (fromDay === null || todayDay === null || fromDay <= todayDay) return copy.now[variant] || copy.now.long;
  const [y, m, d] = availableFrom.split('-').map(Number);
  return (copy.from[variant] || copy.from.long)(y, m, d);
}
