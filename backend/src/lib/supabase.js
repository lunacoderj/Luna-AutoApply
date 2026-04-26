// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.warn('[Supabase] SUPABASE_URL not set — DB operations will fail');
}

// Service-role client — used by backend (bypasses RLS)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || supabaseAnonKey || 'placeholder',
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

// Anon client — used for auth-related operations
export const supabaseAnon = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export default supabase;
