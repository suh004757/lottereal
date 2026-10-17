export const SAFE_CONTACT_PHONE = '0507-1402-5055';
export const SAFE_CONTACT_TEL = 'tel:050714025055';

/**
 * Public LotteReal surfaces always use the approved safe number.
 * Listing-level contact values are intentionally not exposed.
 */
export function getPublicContactPhone() {
  return SAFE_CONTACT_PHONE;
}

/**
 * Call-button label. Desktops usually can't dial, so they get the number itself
 * (one glance, no extra click); phones keep the short action label and dial on tap.
 */
export function getPhoneButtonLabel(phoneLabel = '전화 문의') {
  const canDial = typeof window === 'undefined'
    || !window.matchMedia
    || window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  return canDial ? phoneLabel : `전화 ${SAFE_CONTACT_PHONE}`;
}
