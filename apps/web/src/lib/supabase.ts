import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== '' &&
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('https://'),
);

if (!isSupabaseConfigured) {
  const missingMsg =
    '⚠️ [NEXUS WAYS] Supabase credentials (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are missing or invalid. ' +
    'Please set these environment variables in your Render Dashboard / deployment settings.';
  console.error(missingMsg);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided during build/runtime. ' +
      'Please configure them in Render environment settings.',
    );
  }
  return supabase;
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl! : 'https://unconfigured-supabase.local',
  isSupabaseConfigured ? supabaseAnonKey! : 'unconfigured-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
