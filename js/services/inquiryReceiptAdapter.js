import { getSupabaseClient } from '../config/supabaseConfig.js';

export async function listPublicExternalInquiryReceipts({ limit = 8 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const { data, error } = await supabase
    .from('external_inquiry_receipts')
    .select('source, listing_number, transaction_type, received_hour, status, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('received_hour', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error('public receipt lookup failed');
  return Array.isArray(data) ? data : [];
}
