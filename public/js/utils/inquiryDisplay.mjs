const DEFAULT_PREVIEW_LENGTH = 220;

export function summarizeInquiryMessage(value, maxLength = DEFAULT_PREVIEW_LENGTH) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
