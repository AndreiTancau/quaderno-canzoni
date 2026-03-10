import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

/**
 * Returns a Supabase client instance, or null if env vars are not configured.
 * The client is typed as `any` since we don't have generated DB types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): any {
  if (!client && supabaseUrl && supabaseAnonKey) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
