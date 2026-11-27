"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/ui/form";

const orgInput = z.object({
  name: z.string().trim().min(1, "Add a name.").max(120),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Choose a valid time zone."),
  default_currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, like USD."),
  locale: z.enum(["en", "es"]),
});

export async function updateOrganizationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "settings:manage")) return { message: "Only admins can change workspace settings." };
  const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = orgInput.safeParse(raw);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: raw };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(parsed.data).eq("id", ws.organization.id);
  if (error) return { message: friendlyDbError(error, "setting"), values: raw };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
