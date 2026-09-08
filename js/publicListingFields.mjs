export const PUBLIC_LISTING_SELECT_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'price',
  'currency',
  'property_type',
  'address',
  'city',
  'district',
  'latitude',
  'longitude',
  'images',
  'created_at'
]);

export const PUBLIC_LISTING_SELECT_QUERY = PUBLIC_LISTING_SELECT_FIELDS.join(',');
