import { APP_CONFIG } from '../config/appConfig.js';

// Listing payload contract to keep UI and backend aligned.
// Extend as needed when fields are added to the backend.
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
  metadata: {}
};

export async function createListing(payload) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return _createSupabase(payload);
  if (provider === 'api') return _createApi(payload);
  return _mockCreate(payload);
}

export async function uploadImage(file) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (!file) return { url: null };

  if (provider === 'supabase') return _uploadSupabase(file);
  if (provider === 'api') return _uploadApi(file);
  return _mockUpload(file);
}

async function _createSupabase(payload) {
  // TODO: Replace with Supabase client implementation.
  console.warn('[Supabase Backend] Not implemented. Payload queued:', payload);
  return { success: false, error: 'Supabase adapter not implemented yet.' };
}

async function _createApi(payload) {
  // TODO: Replace with HTTP client (fetch/axios) implementation.
  console.warn('[API Backend] Not implemented. Payload queued:', payload);
  return { success: false, error: 'API adapter not implemented yet.' };
}

async function _mockCreate(payload) {
  console.log('[Mock Backend] Creating listing:', payload);
  return { success: true, id: 'mock-id-123', payload };
}

async function _uploadSupabase(file) {
  console.warn('[Supabase Backend] Image upload not implemented. File queued:', file?.name);
  return { url: null };
}

async function _uploadApi(file) {
  console.warn('[API Backend] Image upload not implemented. File queued:', file?.name);
  return { url: null };
}

async function _mockUpload(file) {
  const url = typeof URL !== 'undefined' && file ? URL.createObjectURL(file) : null;
  console.log('[Mock Backend] Uploading image stub:', file?.name, url);
  return { url };
}
