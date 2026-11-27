import {BRAND_NAME} from './brand.mjs';
import {ENABLE_SIGN_IN} from './config.mjs';
import {SAFE_CONTACT_TEL,getPhoneButtonLabel} from '../../js/utils/contactPhone.mjs';
import {isListingId} from './platformListings.mjs';
export const $ = (selector, root = document) => root.querySelector(selector);
export function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  return node;
}
export const link = (text,href,classes = '') => el('a',text,{href,class:classes});
export function callLink(label = '전화 문의') { return link(getPhoneButtonLabel(label), SAFE_CONTACT_TEL, 'button primary'); }
export function listingLink(id) { return `listing.html?id=${encodeURIComponent(id)}`; }
export function shell() {
  $('[data-brand]').textContent = BRAND_NAME;
  document.title = `${document.title || $('h1').textContent} | ${BRAND_NAME}`;
  const authLink = $('[data-auth-link]');
  if (authLink && ENABLE_SIGN_IN && document.body.dataset.page !== 'login') {
    const target = location.pathname + location.search;
    authLink.href = `login.html?return=${encodeURIComponent(target)}`;
    authLink.hidden = false;
  }
}
export function readIds(kind) {
  try {
    const value = JSON.parse(localStorage.getItem(`jamsilsari:${kind}`) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter(isListingId))] : [];
  } catch { return []; }
}
export function saveIds(kind, ids) {
  try { localStorage.setItem(`jamsilsari:${kind}`,JSON.stringify(ids)); return true; }
  catch { return false; }
}
export function setMessage(text) { $('#message').textContent = text; }
export function unavailable() { return el('p','지금은 볼 수 없는 매물입니다.'); }
export async function requireResult(request) {
  const {data,error} = await request;
  if (error) throw error;
  return data;
}
