"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ORIGINATION_BPS, splitProblems, type SplitLine } from "./split";

const Payload = z.object({
  origination: z.uuid().nullable(),
  team: z.array(z.object({ partnerId: z.uuid(), percentBps: z.number().int().min(1).max(10000) })).max(20),
});

// Replace a project's split (admins only; RLS enforces it too). The database re-checks the limits.
export async function saveProjectSplitAction(projectId: string, input: z.input<typeof Payload>): Promise<{ ok: true } | { ok: false; message: string }> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "partners:read")) return { ok: false, message: "Only admins can change the split." };
  if (!z.uuid().safeParse(projectId).success) return { ok: false, message: "Unknown project." };
  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the people and percentages." };

  const lines: SplitLine[] = [
    ...(parsed.data.origination ? [{ partnerId: parsed.data.origination, role: "origination" as const, percentBps: ORIGINATION_BPS }] : []),
    ...parsed.data.team.map((t) => ({ partnerId: t.partnerId, role: "delivery" as const, percentBps: t.percentBps })),
  ];
  const problems = splitProblems(lines);
  if (problems.length) return { ok: false, message: problems.join(" ") };

  const supabase = await createClient();
  const org = ws.organization.id;
  const { data: project } = await supabase.from("projects").select("id").eq("organization_id", org).eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, message: "Unknown project." };

  const { data: previous } = await supabase.from("project_splits").select("partner_id, role, percent_bps").eq("organization_id", org).eq("project_id", projectId);
  const { error: delError } = await supabase.from("project_splits").delete().eq("organization_id", org).eq("project_id", projectId);
  if (delError) return { ok: false, message: friendlyDbError(delError, "split") };
  if (lines.length) {
    const { error } = await supabase
      .from("project_splits")
      .insert(lines.map((l) => ({ organization_id: org, project_id: projectId, partner_id: l.partnerId, role: l.role, percent_bps: l.percentBps })));
    if (error) {
      // Put the previous split back so a failed save never leaves the project without one.
      if (previous?.length) {
        await supabase.from("project_splits").insert(previous.map((p) => ({ organization_id: org, project_id: projectId, partner_id: p.partner_id, role: p.role, percent_bps: p.percent_bps })));
      }
      return { ok: false, message: error.message.includes("15%") || error.message.includes("100%") ? error.message : friendlyDbError(error, "split") };
    }
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  return { ok: true };
}
