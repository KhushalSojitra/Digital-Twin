import { createClient } from '@supabase/supabase-js';
import { getDbToken } from './dbToken'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase runtime configuration is missing.')
}

// The single shared real-time connection used by every ticket surface. It is read-only: the anon key alone
// can read nothing, so each request carries the short-lived token the server issues to a signed-in user.
// Every ticket change goes through the /api routes instead.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: () => getDbToken(),
});
