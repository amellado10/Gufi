import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ClientStatus } from "./status";

// All reads go through the user's own Supabase session, so RLS decides what comes back.

export async function listClients(organizationId: string, opts: { q?: string; status?: ClientStatus } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("clients")
    .select("id, name, domain, industry, status, owner_id, updated_at, projects(id, status)")
    .eq("organization_id", organizationId)
    .order("name");
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.q) {
    // Escape LIKE wildcards and PostgREST's filter separators in the search text.
    const term = opts.q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
    query = query.or(`name.ilike.%${term}%,domain.ilike.%${term}%`);
  }
  const { data, error } = await query.limit(500);
  if (error) throw new Error(`Could not load clients: ${error.message}`);
  return data ?? [];
}

export async function getClientDetail(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the client: ${error.message}`);
  return data;
}

export async function listContacts(organizationId: string, clientId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, is_primary")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("full_name");
  if (error) throw new Error(`Could not load contacts: ${error.message}`);
  return data ?? [];
}

export async function clientOptions(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").select("id, name").eq("organization_id", organizationId).neq("status", "inactive").order("name");
  if (error) throw new Error(`Could not load clients: ${error.message}`);
  return data ?? [];
}
