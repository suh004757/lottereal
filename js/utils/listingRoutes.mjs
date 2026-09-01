const SPECIAL_LISTING_ROUTES = Object.freeze({
  '4b2080fa-ebc5-4363-a801-ca1be33add3e': 'songpa-samgong-building.html'
});

export function getListingDetailUrl(item = {}) {
  const id = String(item.id || '').trim();
  if (SPECIAL_LISTING_ROUTES[id]) return SPECIAL_LISTING_ROUTES[id];
  return `listing-detail.html?id=${encodeURIComponent(id)}`;
}
