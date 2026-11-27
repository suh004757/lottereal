import {ENABLE_SIGN_IN} from './config.mjs';
import {isListingId} from './platformListings.mjs';
const fallback = '/jamsilsari/me.html';
export function safeReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/jamsilsari/') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  if (['/jamsilsari/invite.html','/jamsilsari/dashboard.html'].includes(value)) return value;
  const [path, query] = value.split('?');
  if (path === '/jamsilsari/listing.html') {
    const id = new URLSearchParams(query).get('id');
    return isListingId(id) ? `${path}?id=${id}` : fallback;
  }
  return ['/jamsilsari/','/jamsilsari/index.html','/jamsilsari/request.html',fallback].includes(path) ? path : fallback;
}
export async function syncFavorites(local, read, add) {
  const saved = new Set(await read()), pending = [];
  for (const id of new Set(local)) {
    if (saved.has(id) || await add(id)) saved.add(id);
    else pending.push(id);
  }
  return {saved:[...saved],pending};
}
const signInOnly = () => { if (!ENABLE_SIGN_IN) throw new Error('Sign-in disabled'); };
export function startGoogle(client, target) {
  signInOnly();
  return client.auth.signInWithOAuth({provider:'google', options:{redirectTo:callback(target)}});
}
export function sendMagicLink(client, email, target) {
  signInOnly();
  return client.auth.signInWithOtp({email, options:{emailRedirectTo:callback(target),shouldCreateUser:true}});
}
function callback(target) {
  const url = new URL('/jamsilsari/login.html', location.origin);
  url.searchParams.set('return',safeReturn(target));
  return url.href;
}
