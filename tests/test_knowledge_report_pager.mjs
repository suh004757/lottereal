import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPaginatedReports } from '../js/services/knowledgeReportPager.mjs';

test('report pager rejects a first-page failure instead of returning an honest empty result', async () => {
  await assert.rejects(
    collectPaginatedReports({ batchSize: 2, fetchPage: async () => ({ data: null, error: new Error('first-page') }) }),
    /first-page/
  );
});

test('report pager rejects a later-page failure instead of returning incomplete rankings', async () => {
  let page = 0;
  await assert.rejects(
    collectPaginatedReports({
      batchSize: 2,
      fetchPage: async () => ++page === 1
        ? { data: [{ id: 1 }, { id: 2 }], error: null }
        : { data: null, error: new Error('later-page') }
    }),
    /later-page/
  );
});

test('report pager returns every complete page', async () => {
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
  const reports = await collectPaginatedReports({
    batchSize: 2,
    fetchPage: async () => ({ data: pages.shift() || [], error: null })
  });
  assert.deepEqual(reports.map((item) => item.id), [1, 2, 3]);
});
