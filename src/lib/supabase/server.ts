import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

// User-scoped Supabase client for Server Components, Server Actions and Route Handlers.
// It acts as the signed-in user, so every query is filtered by RLS. There is deliberately
// no service-role client in the app: privileged work happens only in scripts/.
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = requireSupabaseConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to ignore:
          // the proxy (src/proxy.ts) refreshes the session on every request.
        }
      },
    },
  });
}
