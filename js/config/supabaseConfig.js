
const SUPABASE_URL = 'https://itcztvceelfvppjwhmvl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_N7z_92ke5pevs3U2TdhJLg_u1GtY7Ek';

// Initialize Supabase Client
// Note: This requires the Supabase JS library to be loaded in the HTML via CDN
let supabase;

if (typeof createClient !== 'undefined') {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    // Fallback or deferred initialization if script loads late
    console.warn('Supabase JS library not loaded yet.');
}

export { supabase };
