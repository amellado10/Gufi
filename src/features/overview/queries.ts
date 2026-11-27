import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/format";

// Overview numbers, counted from real records the user is allowed to see (RLS).
export async function getOverview(organizationId: string, today: string) {
  const supabase = await createClient();
  const soon = addDays(today, 14);
  const open = ["planning", "active", "on_hold"] as const;

  const head = { count: "exact" as const, head: true };
  const [activeClients, prospects, openProjects, dueSoon, overdue, upcoming] = await Promise.all([
    supabase.from("clients").select("id", head).eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("clients").select("id", head).eq("organization_id", organizationId).eq("status", "prospect"),
    supabase.from("projects").select("id", head).eq("organization_id", organizationId).in("status", [...open]),
    supabase.from("projects").select("id", head).eq("organization_id", organizationId).in("status", [...open]).gte("due_date", today).lte("due_date", soon),
    supabase.from("projects").select("id", head).eq("organization_id", organizationId).in("status", [...open]).lt("due_date", today),
    supabase
      .from("projects")
      .select("id, name, status, due_date, client:clients(id, name)")
      .eq("organization_id", organizationId)
      .in("status", [...open])
      .not("due_date", "is", null)
      .lte("due_date", soon)
      .order("due_date")
      .limit(8),
  ]);
  const failed = [activeClients, prospects, openProjects, dueSoon, overdue, upcoming].find((r) => r.error);
  if (failed?.error) throw new Error(`Could not load the overview: ${failed.error.message}`);

  return {
    activeClients: activeClients.count ?? 0,
    prospects: prospects.count ?? 0,
    openProjects: openProjects.count ?? 0,
    dueSoon: dueSoon.count ?? 0,
    overdue: overdue.count ?? 0,
    upcoming: upcoming.data ?? [],
  };
}
