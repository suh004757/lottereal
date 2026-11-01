// Reads leased date ranges for public pages with the anon key (select only).
import { APP_CONFIG } from './config/appConfig.js';

export const LISTING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function fetchPeriods(listingIds, today) {
  const url = new URL('/rest/v1/listing_unavailable_periods', APP_CONFIG.SUPABASE_URL);
  url.searchParams.set('select', 'listing_id,starts_on,ends_on');
  url.searchParams.set('listing_id', `in.(${listingIds.join(',')})`);
  url.searchParams.set('ends_on', `gte.${today}`);
  url.searchParams.set('order', 'starts_on.asc');
  const response = await fetch(url, { headers: { apikey: APP_CONFIG.SUPABASE_KEY, Authorization: `Bearer ${APP_CONFIG.SUPABASE_KEY}` } });
  if (!response.ok) throw new Error(`availability request failed: ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}
