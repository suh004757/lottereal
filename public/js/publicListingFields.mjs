export const PUBLIC_LISTING_SELECT_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'price',
  'deposit',
  'monthly_rent',
  'currency',
  'property_type',
  'address',
  'city',
  'district',
  'latitude',
  'longitude',
  'images',
  'created_at',
  'last_verified_at'
]);

export const PUBLIC_LISTING_SELECT_QUERY = PUBLIC_LISTING_SELECT_FIELDS.join(',');
