import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export type Member = { user_id: string; role: Role; title: string | null; full_name: string | null; email: string };

// Everyone in the organization (RLS: members can read their own organization's roster).
export const getRoster = cache(async (organizationId: string): Promise<Member[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, title, profile:profiles(full_name, email)")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Could not load the team: ${error.message}`);
  return (data ?? [])
    .map((m) => ({ user_id: m.user_id, role: m.role, title: m.title, full_name: m.profile?.full_name ?? null, email: m.profile?.email ?? "" }))
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
});

export const memberLabel = (m: Pick<Member, "full_name" | "email">) => m.full_name?.trim() || m.email;
