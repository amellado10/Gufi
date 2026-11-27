import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

// Browser client. Used only to finish sign-in from Supabase's default email links (tokens in
// the URL #fragment never reach the server). All data access stays on the server.
export function createClient() {
  const { url, key } = requireSupabaseConfig();
  return createBrowserClient<Database>(url, key);
}
