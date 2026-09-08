export function formatManwonAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';

  const rounded = Math.round(amount);
  if (rounded < 10000) return `${rounded.toLocaleString()}만원`;

  const eok = Math.floor(rounded / 10000);
  const remainder = rounded % 10000;
  return remainder
    ? `${eok.toLocaleString()}억 ${remainder.toLocaleString()}만원`
    : `${eok.toLocaleString()}억`;
}

export function formatListingPrice(value, propertyType = '') {
  const amount = formatManwonAmount(value);
  if (!amount) return '';
  const type = String(propertyType || '').trim();
  if (type.includes('매매')) return `매매 ${amount}`;
  if (type.includes('전세')) return `전세 ${amount}`;
  return amount;
}
