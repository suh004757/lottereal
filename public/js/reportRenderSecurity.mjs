export function buildSanitizedReportHtml({ markdown, marked, purifier }) {
  if (typeof marked?.parse !== 'function' || typeof purifier?.sanitize !== 'function') {
    throw new Error('리포트 안전 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  }
  if (typeof marked.setOptions === 'function') {
    marked.setOptions({ breaks: true, gfm: true });
  }
  // The page header already shows the title; drop a leading '# Title' line like the static export does
  const body = String(markdown || '').replace(/^﻿?\s*#\s+[^\n]+\n+/, '');
  const rawHtml = marked.parse(body);
  return purifier.sanitize(String(rawHtml || ''));
}
