import { createListing, uploadImage, LISTING_PAYLOAD_SCHEMA } from './services/backendAdapter.js';
import { useAuth } from './hooks/useAuth.js';

// Form selector is flexible; add data-listing-form to your form to activate.
const LISTING_FORM_SELECTOR = '[data-listing-form]';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector(LISTING_FORM_SELECTOR);

  if (!form) {
    console.info('[Adapter] Listing form not found. Adapter is idle but ready.');
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    const images = await handleImages(formData.getAll('images'));
    const { user } = useAuth();

    const payload = buildListingPayload(formData, images, user);
    console.log('[Adapter] Listing payload (contract):', payload);

    try {
      const response = await createListing(payload);
      console.log('[Adapter] Backend response:', response);
    } catch (error) {
      console.error('[Adapter] Failed to create listing:', error);
    }
  });
});

function buildListingPayload(formData, images, user) {
  return {
    ...LISTING_PAYLOAD_SCHEMA,
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    price: parseNumber(formData.get('price')),
    currency: formData.get('currency') || LISTING_PAYLOAD_SCHEMA.currency,
    location: {
      address: formData.get('address') || '',
      city: formData.get('city') || '',
      district: formData.get('district') || '',
      latitude: parseNumber(formData.get('latitude')),
      longitude: parseNumber(formData.get('longitude'))
    },
    propertyType: formData.get('propertyType') || '',
    images,
    contact: {
      name: formData.get('contactName') || '',
      phone: formData.get('contactPhone') || '',
      email: formData.get('contactEmail') || ''
    },
    metadata: {
      source: 'web-form',
      submittedAt: new Date().toISOString(),
      userId: user?.id || null
    }
  };
}

async function handleImages(files) {
  const uploads = [];
  for (const file of files || []) {
    if (!file || (file instanceof File && file.size === 0)) continue;
    const result = await uploadImage(file);
    if (result?.url) uploads.push(result.url);
  }
  return uploads;
}

function parseNumber(value) {
  const numberValue = value !== null && value !== undefined && value !== '' ? Number(value) : null;
  return Number.isFinite(numberValue) ? numberValue : null;
}
