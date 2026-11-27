import {listingStatus} from './listingStatus.mjs';
import {PUBLIC_LISTING_SELECT_FIELDS} from '../../js/publicListingFields.mjs';
import {getPublicListingFromSupabase} from '../../js/services/publicListingRepository.mjs';
import {formatListingDisplayPrice} from '../../js/utils/propertyPrice.mjs';
import {quoteLease, leaseDays, SHORTSTAY_LISTING_ID} from '../../js/utils/leaseQuote.mjs';

export const TYPES = ['매매','전세','월세','단기임대'];
export const isListingId = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const safeFields = PUBLIC_LISTING_SELECT_FIELDS.filter(key => !['latitude','longitude','last_verified_at','created_at'].includes(key)).join(',');
const projection = 'listing_id,tier,listing_scope,verified_at,transaction_type';
const source = 'pf_public_listing_verifications';
const amount = val => val != null && val !== '' && Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : null;
export function transactionType(row) {
  return TYPES.includes(row.transaction_type) ? row.transaction_type : TYPES.find(type => String(row.property_type || '').includes(type)) || '';
}
export function listingPrice(row) {
  const type = transactionType(row);
  return formatListingDisplayPrice({...row, property_type:type, price:type === '전세' ? row.deposit ?? row.price : row.price}, {emptyLabel:true});
}
export function comparablePrice(row) {
  const type = transactionType(row);
  if (type === '월세') return amount(row.monthly_rent ?? (row.deposit != null ? row.price : null));
  return amount(type === '전세' ? row.deposit ?? row.price : row.price);
}
export function monthlyCosts(row) {
  // Legacy public projection has no generic fee fields. Missing amounts stay unknown.
  const short = transactionType(row) === '단기임대';
  const quote = short && row.id === SHORTSTAY_LISTING_ID ? quoteLease('2026-01-01','2026-01-28') : null;
  const rent = short ? quote?.rent / 10000 || null : comparablePrice(row);
  const maintenance = amount(row.maintenance_fee ?? (quote ? quote.maintenance / 10000 : null));
  const fixed = amount(row.fixed_fees);
  return {rent, maintenance, fixed, monthly:[rent,maintenance,fixed].includes(null) ? null : rent + maintenance + fixed};
}
export function periodCosts(row, start, end) {
  if (transactionType(row) !== '단기임대' || row.id !== SHORTSTAY_LISTING_ID || !leaseDays(start,end)) return null;
  const quote = quoteLease(start,end);
  return quote.ok ? {known:quote.rent + quote.maintenance, cleaning:quote.cleaning, fixed:amount(row.fixed_fees), days:quote.days} : null;
}
export function mapEnabled({key, cspApproved} = {}) {
  return cspApproved === true && typeof key === 'string' && /^[a-f0-9]{32}$/i.test(key);
}
function compareVerification(a,b) {
  return Date.parse(a?.verified_at) - Date.parse(b?.verified_at);
}
export function selectListings(listings, verifications, options = {}) {
  const latest = new Map();
  for (const row of verifications) {
    if (!Number.isFinite(Date.parse(row.verified_at))) continue;
    const prior = latest.get(row.listing_id);
    if (!prior || compareVerification(row,prior) > 0 || (compareVerification(row,prior) === 0 && row.tier === 'withdrawn')) latest.set(row.listing_id,row);
  }
  return listings.flatMap(row => {
    const v = latest.get(row.id);
    const status = listingStatus(v && {...v, closed_at:row.closed_at ?? v.closed_at},options);
    if (!status || status.completed) return [];
    const joined = {...row, transaction_type:v.transaction_type, status};
    const price = comparablePrice(joined);
    if ((options.type && transactionType(joined) !== options.type) || (options.district && row.district !== options.district) ||
        (options.tier && status.tier !== options.tier) || (options.maxPrice != null && (price === null || price > options.maxPrice))) return [];
    return [joined];
  }).sort((a,b) => Number(a.status.needsReview) - Number(b.status.needsReview) ||
    Date.parse(b.status.verifiedAt) - Date.parse(a.status.verifiedAt) || a.id.localeCompare(b.id));
}
export function completedListings(verifications, options) {
  return verifications.flatMap(row => {
    const status = listingStatus(row, options);
    return status?.completed ? [{id:row.listing_id,status}] : [];
  });
}
export async function loadDetail({fetchVerification, fetchListing}, id, options) {
  if (!isListingId(id)) return null;
  const verification = await fetchVerification(id);
  const status = listingStatus(verification, options);
  if (!status) return null;
  if (status.completed) return {id,status};
  const row = await fetchListing(id);
  return row && row.closed_at == null ? {...row, transaction_type:verification.transaction_type, status} : null;
}
async function dataOf(request) {
  const {data,error} = await request;
  if (error) throw error;
  return data;
}
async function verificationData(request) {
  const {data,error} = await request;
  // The public view is intentionally absent in the frontend-only rollout.
  if (error?.code === 'PGRST205' || error?.code === '42P01') return null;
  if (error) throw error;
  return data;
}
// Only the M1 active-view IDs are used. This client is anonymous even when the
// visitor has a member session; the legacy anon RLS excludes closed rows as well.
export function browseRepository(client) {
  return {
    async all() {
      const verifications = [], listings = [];
      let cursor;
      while (true) {
        let query = client.from(source).select(projection).order('listing_id').limit(100);
        if (cursor) query = query.gt('listing_id',cursor);
        const result = await verificationData(query);
        if (result === null) return {listings:[],verifications:[]};
        const page = result;
        if (!page.length) break;
        cursor = page.at(-1).listing_id;
        verifications.push(...page);
        const ids = page.filter(v => listingStatus(v) && isListingId(v.listing_id)).map(v => v.listing_id);
        if (ids.length) listings.push(...((await dataOf(client.from('property_listings').select(safeFields).in('id',ids))) || []));
      }
      return {listings,verifications};
    },
    fetchVerification:id => verificationData(client.from(source).select(projection).eq('listing_id',id).maybeSingle()),
    fetchListing:id => getPublicListingFromSupabase(client,safeFields,id),
  };
}
