import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStatus } from "./status";

export async function listProjects(organizationId: string, opts: { status?: ProjectStatus | "open"; clientId?: string; memberId?: string } = {}) {
  const supabase = await createClient();
  const select = opts.memberId
    ? "id, name, status, owner_id, start_date, due_date, updated_at, client:clients(id, name), project_members!inner(user_id)"
    : "id, name, status, owner_id, start_date, due_date, updated_at, client:clients(id, name)";
  let query = supabase.from("projects").select(select).eq("organization_id", organizationId);
  if (opts.status === "open") query = query.in("status", ["planning", "active", "on_hold"]);
  else if (opts.status) query = query.eq("status", opts.status);
  if (opts.clientId) query = query.eq("client_id", opts.clientId);
  if (opts.memberId) query = query.eq("project_members.user_id", opts.memberId);
  const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false }).order("name").limit(500);
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    status: ProjectStatus;
    owner_id: string | null;
    start_date: string | null;
    due_date: string | null;
    updated_at: string;
    client: { id: string; name: string } | null;
  }[];
}

export async function getProjectDetail(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, client:clients(id, name), project_members(user_id, added_at)")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return data;
}
