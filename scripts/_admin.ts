// Shared by the admin scripts. Uses the Supabase SECRET key, which bypasses RLS:
// it lives only in .env.local on an admin's machine and is never imported by the app.
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { isRole, ROLES, type Role } from "../src/lib/roles";

config({ path: ".env.local", quiet: true });

export function adminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
    process.exit(1);
  }
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function parseRole(value: string | undefined): Role {
  if (!isRole(value)) {
    console.error(`--role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  return value;
}

// Find an auth user by email, or invite them (Supabase sends the invitation email).
export async function inviteOrFind(supabase: SupabaseClient<Database>, email: string, fullName?: string): Promise<{ id: string; invited: boolean }> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return { id: found.id, invited: false };
    if (data.users.length < 200) break;
  }
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(normalized, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: `${siteUrl}/auth/set-password`,
  });
  if (error) throw error;
  return { id: data.user.id, invited: true };
}
