/**
 * Backend Adapter - 백엔드 서비스 어댑터
 * 다양한 백엔드 프로바이더(Supabase, API, Mock)를 지원하여 데이터 작업을 추상화합니다.
 */

import { APP_CONFIG } from '../config/appConfig.js';
import { getSupabaseClient } from '../config/supabaseConfig.js';

// 리스팅 페이로드 스키마 정의
export const LISTING_PAYLOAD_SCHEMA = {
  title: '',
  description: '',
  price: null,
  currency: 'KRW',
  location: {
    address: '',
    city: '',
    district: '',
    latitude: null,
    longitude: null
  },
  propertyType: '',
  images: [],
  contact: {
    name: '',
    phone: '',
    email: ''
  },
  metadata: {
    source: 'web-form',
    submittedAt: null,
    userId: null
  }
};

function buildDefaultDashboardStats() {
  return {
    totalListings: 0,
    newListings7d: 0,
    totalInquiries: 0,
    unreadInquiries: 0
  };
}

/**
 * 새로운 부동산 리스팅을 생성합니다.
 * @param {Object} payload - 리스팅 데이터
 * @returns {Promise<Object>} 생성된 리스팅
 */
export async function createListing(payload) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return createListingSupabase(payload);
  if (provider === 'api') return createListingApi(payload);
  return createListingMock(payload);
}

/**
 * 이미지 파일을 스토리지에 업로드합니다.
 * @param {File} file - 업로드할 파일
 * @returns {Promise<string>} 업로드된 이미지 URL
 */
export async function uploadImage(file) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return uploadImageSupabase(file);
  if (provider === 'api') return uploadImageApi(file);
  return uploadImageMock(file);
}

/**
 * 공개 문의를 제출합니다.
 * @param {Object} payload - 문의 데이터
 * @returns {Promise<Object>} 제출 결과
 */
export async function createInquiry(payload) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return createInquirySupabase(payload);
  return createInquiryMock(payload);
}

/**
 * 공개 리스팅을 검색 및 페이징합니다.
 * @param {Object} options - 검색 옵션
 * @returns {Promise<Array>} 리스팅 목록
 */
export async function listListingsPublic({
  query = '',
  page = 1,
  pageSize = 12,
  propertyType = '',
  city = '',
  district = '',
  minPrice,
  maxPrice
} = {}) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') {
    return listListingsPublicSupabase({ query, page, pageSize, propertyType, city, district, minPrice, maxPrice });
  }
  return listListingsMock();
}

/**
 * 외부 피드(뉴스/정책 캐시)를 가져옵니다.
 * @param {Object} options - 피드 옵션
 * @returns {Promise<Array>} 피드 목록
 */
export async function listExternalFeeds({ source, limit = 10 } = {}) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return listExternalFeedsSupabase({ source, limit });
  return [];
}

/**
 * ID로 단일 리스팅을 가져옵니다.
 * @param {string} id - 리스팅 ID
 * @returns {Promise<Object|null>} 리스팅 객체 또는 null
 */
export async function getListingById(id) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return getListingByIdSupabase(id);
  return listListingsMock().find((l) => l.id === id) || null;
}

/**
 * 대시보드 통계를 가져옵니다.
 * @returns {Promise<Object>} 통계 데이터
 */
export async function getDashboardStats() {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return getDashboardStatsSupabase();
  return {
    ok: true,
    data: {
      ...buildDefaultDashboardStats(),
      totalListings: listListingsMock().length
    },
    error: null
  };
}

/**
 * Recent activities (listings + inquiries)
 */
export async function getRecentActivities(limit = 20) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return getRecentActivitiesSupabase(limit);
  return listListingsMock()
    .slice(0, limit)
    .map((l) => ({ type: 'listing', title: l.title, created_at: new Date().toISOString(), id: l.id }));
}

/**
 * Admin: list listings
 */
export async function listListingsAdmin({ page = 1, pageSize = 20, sort = 'created_at', direction = 'desc' } = {}) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return listListingsAdminSupabase({ page, pageSize, sort, direction });
  return { ok: true, data: listListingsMock(), meta: { page, pageSize, total: listListingsMock().length }, error: null };
}

/**
 * Admin: update listing
 */
export async function updateListing(id, patch) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return updateListingSupabase(id, patch);
  return { id, ...patch };
}

/**
 * Admin: delete listing
 */
export async function deleteListing(id) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return deleteListingSupabase(id);
  return { id, deleted: true };
}

/**
 * Admin: list inquiries
 */
export async function listInquiriesAdmin({ page = 1, pageSize = 20, status, query } = {}) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return listInquiriesAdminSupabase({ page, pageSize, status, query });
  return { ok: true, data: [], meta: { page, pageSize, total: 0 }, error: null };
}

/**
 * Admin: update inquiry status
 */
export async function updateInquiryStatus(id, status = 'read') {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return updateInquiryStatusSupabase(id, status);
  return { id, status };
}

function getApiBaseUrl() {
  const base = (APP_CONFIG.API_BASE_URL || '').trim();
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

async function createListingApi(payload) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    console.warn('API base URL not configured, falling back to mock createListing.');
    return createListingMock(payload);
  }

  const response = await fetch(`${baseUrl}/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`API createListing failed: ${response.status} ${message || response.statusText}`);
  }

  return response.json();
}

async function createListingSupabase(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('Supabase client unavailable, falling back to mock createListing.');
    return createListingMock(payload);
  }

  const dbPayload = {
    title: payload.title,
    description: payload.description,
    price: payload.price,
    currency: payload.currency || 'KRW',
    address: payload.location?.address,
    city: payload.location?.city,
    district: payload.location?.district,
    latitude: payload.location?.latitude,
    longitude: payload.location?.longitude,
    property_type: payload.propertyType,
    images: payload.images,
    contact_name: payload.contact?.name,
    contact_phone: payload.contact?.phone,
    contact_email: payload.contact?.email,
    user_id: payload.metadata?.userId
  };

  const { data, error } = await supabase
    .from('property_listings')
    .insert([dbPayload])
    .select();

  if (error) {
    console.error('Supabase Error:', error);
    throw error;
  }
  return data;
}

async function uploadImageApi(file) {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    console.warn('API base URL not configured, falling back to mock upload.');
    return uploadImageMock(file);
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`API uploadImage failed: ${response.status} ${message || response.statusText}`);
  }

  return response.json();
}

async function uploadImageSupabase(file) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('Supabase client unavailable, falling back to mock upload.');
    return uploadImageMock(file);
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { data, error } = await supabase.storage
    .from('property-images')
    .upload(filePath, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('property-images')
    .getPublicUrl(filePath);

  return { url: publicUrl };
}

async function createListingMock(payload) {
  console.log('[Mock Backend] createListing payload', payload);
  return { success: true, id: `mock-${Date.now()}` };
}

async function uploadImageMock(file) {
  const url = typeof URL !== 'undefined' && file ? URL.createObjectURL(file) : null;
  console.log('[Mock Backend] uploadImage stub', file?.name, url);
  return { url };
}

async function createInquirySupabase(payload) {
  const supabase = getSupabaseClient();
  if (!supabase) return createInquiryMock(payload);
  const { data, error } = await supabase
    .from('inquiries')
    .insert([{
      listing_id: payload.listingId || null,
      listing_title: payload.listingTitle || null,
      name: payload.name || '',
      phone: payload.phone || '',
      email: payload.email || '',
      message: payload.message || '',
      status: payload.status || 'unread',
      metadata: payload.metadata || null
    }])
    .select();
  if (error) throw error;
  return data;
}

async function createInquiryMock(payload) {
  console.log('[Mock Backend] createInquiry payload', payload);
  return { success: true, id: `mock-inquiry-${Date.now()}` };
}

async function listListingsPublicSupabase({ query, page, pageSize, propertyType, city, district, minPrice, maxPrice }) {
  const supabase = getSupabaseClient();
  if (!supabase) return listListingsMock();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let req = supabase.from('property_listings').select('*').order('created_at', { ascending: false }).range(from, to);
  if (query) {
    const q = `%${query}%`;
    req = req.or(`title.ilike.${q},description.ilike.${q},address.ilike.${q},city.ilike.${q},district.ilike.${q}`);
  }
  if (propertyType) req = req.eq('property_type', propertyType);
  if (city) req = req.ilike('city', `%${city}%`);
  if (district) req = req.ilike('district', `%${district}%`);
  if (minPrice) req = req.gte('price', Number(minPrice));
  if (maxPrice) req = req.lte('price', Number(maxPrice));
  const { data, error } = await req;
  if (error) {
    console.error('Supabase listListingsPublic error', error);
    return listListingsMock();
  }
  return data || [];
}

async function getListingByIdSupabase(id) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('property_listings').select('*').eq('id', id).single();
  if (error) {
    console.error('Supabase getListingById error', error);
    return null;
  }
  return data;
}

async function getDashboardStatsSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, data: buildDefaultDashboardStats(), error: 'Supabase client unavailable' };
  }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const queries = [
      supabase.from('property_listings').select('*', { count: 'exact', head: true }),
      supabase
        .from('property_listings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo),
      supabase.from('inquiries').select('*', { count: 'exact', head: true }),
      supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', 'unread')
    ];
    const results = await Promise.all(queries);
    const errors = results.map((r) => r.error).filter(Boolean);
    if (errors.length) {
      errors.forEach((err) => console.error('Supabase getDashboardStats error', err));
      return { ok: false, data: buildDefaultDashboardStats(), error: errors[0]?.message || 'Failed to load dashboard stats' };
    }

    const stats = {
      totalListings: results[0].count || 0,
      newListings7d: results[1].count || 0,
      totalInquiries: results[2].count || 0,
      unreadInquiries: results[3].count || 0
    };
    return { ok: true, data: stats, error: null };
  } catch (err) {
    console.error('Supabase getDashboardStats exception', err);
    return { ok: false, data: buildDefaultDashboardStats(), error: err.message || 'Unexpected dashboard stats error' };
  }
}

async function getRecentActivitiesSupabase(limit = 20) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data: listings, error } = await supabase
    .from('property_listings')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Supabase getRecentActivities error', error);
    return [];
  }
  return (listings || []).map((l) => ({ type: 'listing', id: l.id, title: l.title, created_at: l.created_at }));
}

async function listListingsAdminSupabase({ page, pageSize, sort, direction }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: 'Supabase client unavailable' };
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  try {
    const { data, error, count } = await supabase
      .from('property_listings')
      .select('*', { count: 'exact' })
      .order(sort, { ascending: direction === 'asc' })
      .range(from, to);
    if (error) {
      console.error('Supabase listListingsAdmin error', error);
      return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: error.message || 'Failed to load listings' };
    }
    return { ok: true, data: data || [], meta: { page, pageSize, total: typeof count === 'number' ? count : data?.length || 0 }, error: null };
  } catch (err) {
    console.error('Supabase listListingsAdmin exception', err);
    return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: err.message || 'Unexpected listings error' };
  }
}

async function updateListingSupabase(id, patch) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const dbPatch = {
    title: patch.title,
    description: patch.description,
    price: patch.price,
    currency: patch.currency,
    address: patch.location?.address || patch.address,
    city: patch.location?.city || patch.city,
    district: patch.location?.district || patch.district,
    latitude: patch.location?.latitude,
    longitude: patch.location?.longitude,
    property_type: patch.propertyType || patch.property_type,
    images: patch.images,
    contact_name: patch.contact?.name || patch.contact_name,
    contact_phone: patch.contact?.phone || patch.contact_phone,
    contact_email: patch.contact?.email || patch.contact_email
  };
  const { data, error } = await supabase.from('property_listings').update(dbPatch).eq('id', id).select().single();
  if (error) {
    console.error('Supabase updateListing error', error);
    throw error;
  }
  return data;
}

async function deleteListingSupabase(id) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { error } = await supabase.from('property_listings').delete().eq('id', id);
  if (error) {
    console.error('Supabase deleteListing error', error);
    throw error;
  }
  return { id, deleted: true };
}

async function listInquiriesAdminSupabase({ page, pageSize, status, query }) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: 'Supabase client unavailable' };
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  try {
    let req = supabase.from('inquiries').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
    if (status) req = req.eq('status', status);
    if (query) {
      const q = `%${query}%`;
      req = req.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q},message.ilike.${q},listing_title.ilike.${q}`);
    }
    const { data, error, count } = await req;
    if (error) {
      console.error('Supabase listInquiriesAdmin error', error);
      return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: error.message || 'Failed to load inquiries' };
    }
    return { ok: true, data: data || [], meta: { page, pageSize, total: typeof count === 'number' ? count : data?.length || 0 }, error: null };
  } catch (err) {
    console.error('Supabase listInquiriesAdmin exception', err);
    return { ok: false, data: [], meta: { page, pageSize, total: 0 }, error: err.message || 'Unexpected inquiries error' };
  }
}

async function updateInquiryStatusSupabase(id, status) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inquiries')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Supabase updateInquiryStatus error', error);
    return null;
  }
  return data;
}

function listListingsMock() {
  return [];
}

async function listExternalFeedsSupabase({ source, limit }) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  let req = supabase
    .from('external_feeds')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit || 10);
  if (source) req = req.eq('source', source);
  const { data, error } = await req;
  if (error) {
    console.error('Supabase listExternalFeeds error', error);
    return [];
  }
  return data || [];
}

 
 