function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildAdminListingPayload(form = {}, images = []) {
  const propertyType = form.propertyType || form.transactionType || '';
  const price = optionalNumber(form.price);
  const hasMonthlyRentField = Object.prototype.hasOwnProperty.call(form, 'monthlyRent');
  const monthlyRent = optionalNumber(form.monthlyRent);
  return {
    title: form.title || form.name || '관리자 등록 매물',
    description: form.description || '',
    price,
    deposit: optionalNumber(form.deposit),
    monthlyRent: propertyType === '월세' ? (hasMonthlyRentField ? monthlyRent : price) : null,
    currency: 'KRW',
    location: {
      address: form.address || '',
      city: form.city || 'Seoul',
      district: form.district || 'Songpa'
    },
    propertyType,
    images: Array.isArray(images) ? images : [],
    contact: {
      name: form.contactName || '',
      phone: form.contactPhone || '',
      email: form.contactEmail || ''
    },
    metadata: {
      source: 'admin-dashboard',
      submittedAt: new Date().toISOString()
    }
  };
}

export function mapListingPayloadToDatabase(payload = {}) {
  return {
    title: payload.title,
    description: payload.description,
    price: payload.price ?? null,
    deposit: payload.deposit ?? null,
    monthly_rent: payload.monthlyRent ?? payload.monthly_rent ?? null,
    currency: payload.currency || 'KRW',
    address: payload.location?.address ?? payload.address,
    city: payload.location?.city ?? payload.city,
    district: payload.location?.district ?? payload.district,
    latitude: payload.location?.latitude ?? payload.latitude,
    longitude: payload.location?.longitude ?? payload.longitude,
    property_type: payload.propertyType ?? payload.property_type,
    images: payload.images,
    contact_name: payload.contact?.name ?? payload.contact_name,
    contact_email: payload.contact?.email ?? payload.contact_email,
    user_id: payload.metadata?.userId ?? payload.user_id
  };
}
