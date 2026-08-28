export const SAFE_CONTACT_PHONE = '0507-1402-5055';
export const SAFE_CONTACT_TEL = 'tel:050714025055';

/**
 * Public LotteReal surfaces always use the approved safe number.
 * Listing-level contact values are intentionally not exposed.
 */
export function getPublicContactPhone() {
  return SAFE_CONTACT_PHONE;
}
