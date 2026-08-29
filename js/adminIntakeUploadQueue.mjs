export async function runAdminIntakeUploadQueue(items, {
  concurrency = 3,
  upload,
  onProgress
} = {}) {
  const list = Array.from(items || []);
  if (typeof upload !== 'function') throw new Error('업로드 함수를 확인할 수 없습니다.');
  if (!list.length) return [];
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  const completed = [];
  let cursor = 0;
  let firstError = null;

  async function worker() {
    while (!firstError) {
      const index = cursor++;
      if (index >= list.length) return;
      try {
        const path = await upload(list[index], index);
        results[index] = path;
        completed.push({ index, path });
        onProgress?.({ completed: completed.length, total: list.length });
      } catch (error) {
        firstError = error instanceof Error ? error : new Error(String(error || '업로드 실패'));
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (firstError) {
    firstError.completedPaths = completed
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.path);
    throw firstError;
  }
  return results;
}
