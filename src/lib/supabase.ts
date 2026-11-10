import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true cuando hay un proyecto real configurado en .env.local */
export const haySupabase = Boolean(
  url && anon && /^https:\/\/.+\.supabase\.co$/.test(url) && anon.length > 40,
);

export const supabase: SupabaseClient | null = haySupabase
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function exigirCliente(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado');
  return supabase;
}
