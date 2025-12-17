import { APP_CONFIG } from '../config/appConfig.js';
import { getSupabaseClient } from '../config/supabaseConfig.js';

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

/**
 * Creates a new property listing in Supabase
 */
export async function createListing(payload) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return createListingSupabase(payload);
  // TODO: add API provider if needed
  return createListingMock(payload);
}

/**
 * Uploads an image file to Supabase Storage
 */
export async function uploadImage(file) {
  const provider = (APP_CONFIG.BACKEND_PROVIDER || 'mock').toLowerCase();
  if (provider === 'supabase') return uploadImageSupabase(file);
  // TODO: add API provider if needed
  return uploadImageMock(file);
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
