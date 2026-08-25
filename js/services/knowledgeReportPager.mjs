export async function collectPaginatedReports({ batchSize = 200, fetchPage } = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage must be a function');
  const safeBatchSize = Math.min(Math.max(Math.floor(Number(batchSize) || 200), 1), 1000);
  const reports = [];
  let from = 0;

  while (true) {
    const to = from + safeBatchSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    reports.push(...page);
    if (page.length < safeBatchSize) return reports;
    from += safeBatchSize;
  }
}
