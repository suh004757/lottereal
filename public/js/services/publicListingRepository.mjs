export function assertSupabasePrivilegedProvider(provider) {
  if (String(provider || '').toLowerCase() !== 'supabase') {
    throw new Error('Supabase is required for privileged listing operations');
  }
}

export async function listPublicListingsFromSupabase(supabase, selectQuery, {
  query = '', page = 1, pageSize = 12, propertyType = '', city = '', district = '', minPrice, maxPrice
} = {}) {
  if (!supabase) throw new Error('Supabase client unavailable');
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = supabase
    .from('property_listings')
    .select(selectQuery)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (query) {
    const value = `%${query}%`;
    request = request.or(`title.ilike.${value},description.ilike.${value},address.ilike.${value},city.ilike.${value},district.ilike.${value}`);
  }
  if (propertyType) request = request.eq('property_type', propertyType);
  if (city) request = request.ilike('city', `%${city}%`);
  if (district) request = request.ilike('district', `%${district}%`);
  if (minPrice) request = request.gte('price', Number(minPrice));
  if (maxPrice) request = request.lte('price', Number(maxPrice));
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

export async function getPublicListingFromSupabase(supabase, selectQuery, id) {
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error } = await supabase
    .from('property_listings')
    .select(selectQuery)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
