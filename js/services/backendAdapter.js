import { supabase } from '../config/supabaseConfig.js';

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
  if (!supabase) throw new Error('Supabase client not initialized');

  // Flatten payload for SQL table
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
    images: payload.images, // Supabase handles array text[]
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

/**
 * Uploads an image file to Supabase Storage
 */
export async function uploadImage(file) {
  if (!supabase) throw new Error('Supabase client not initialized');

  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { data, error } = await supabase.storage
    .from('property-images')
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  // Get Public URL
  const { data: { publicUrl } } = supabase.storage
    .from('property-images')
    .getPublicUrl(filePath);

  return { url: publicUrl };
}
