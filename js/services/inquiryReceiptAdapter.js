import { getSupabaseClient } from '../config/supabaseConfig.js';

export async function listPublicExternalInquiryReceipts() {
  const supabase = getSupabaseClient();
  if (!supabase) return { items: [], summary: null };
  const { data, error } = await supabase.rpc('get_external_inquiry_activity');
  if (error) throw new Error('public inquiry activity lookup failed');
  if (!data || typeof data !== 'object') return { items: [], summary: null };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    summary: data.summary && typeof data.summary === 'object' ? data.summary : null
  };
}
