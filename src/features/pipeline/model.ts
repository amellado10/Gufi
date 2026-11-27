// Pipeline labels, validation and math. Pure: tested in tests/unit/pipeline.test.ts.
import { z } from "zod";
import { optionalText, optionalUuid } from "@/features/clients/schema";
import type { Enums } from "@/types/database";

export type LeadSource = Enums<"lead_source">;
export type StageKind = Enums<"stage_kind">;

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "partner", label: "Partner (Shopify, Webflow…)" },
  { value: "website", label: "Website / inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "marketing", label: "Marketing campaign" },
  { value: "existing_client", label: "Existing client" },
  { value: "other", label: "Other" },
];
export const sourceLabel = (s: LeadSource) => LEAD_SOURCES.find((x) => x.value === s)?.label ?? s;

// "1,250.50" / "$1250" / "1250" → 125050 cents. Rejects negatives, more than 2 decimals, junk.
export function parseMoneyToCents(input: string): number | null | "invalid" {
  const raw = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!raw) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(raw)) return "invalid";
  const [whole, frac = ""] = raw.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.iso.date("Use a valid date.").nullable())
  .optional()
  .transform((v) => v ?? null);

export const dealInput = z
  .object({
    client_id: z.string().trim().optional(),
    new_client_name: optionalText(200),
    title: z.string().trim().min(1, "Give the deal a name.").max(200),
    stage_id: z.uuid("Choose a stage."),
    value: z.string().trim().max(20).optional().default(""),
    owner_id: optionalUuid,
    contact_id: optionalUuid,
    source: z.enum(LEAD_SOURCES.map((s) => s.value) as [LeadSource, ...LeadSource[]]).default("other"),
    source_detail: optionalText(200),
    brought_by_partner_id: optionalUuid,
    expected_close_on: optionalDate,
    next_follow_up_on: optionalDate,
    lost_reason: optionalText(1000),
    notes: optionalText(10000),
  })
  .superRefine((v, ctx) => {
    const hasClient = Boolean(v.client_id && z.uuid().safeParse(v.client_id).success);
    if (!hasClient && !v.new_client_name) ctx.addIssue({ code: "custom", path: ["client_id"], message: "Choose a client or enter a new company name." });
    if (parseMoneyToCents(v.value) === "invalid") ctx.addIssue({ code: "custom", path: ["value"], message: "Enter an amount like 2500 or 2,500.00." });
  })
  .transform((v) => ({
    ...v,
    client_id: v.client_id && z.uuid().safeParse(v.client_id).success ? v.client_id : null,
    value_cents: parseMoneyToCents(v.value) as number | null,
  }));
export type DealInput = z.infer<typeof dealInput>;

// Weighted pipeline: Σ value × stage probability, rounded half-up to the cent. Open stages only.
export function weightedValue(deals: { value_cents: number | null; probability_bps: number; kind: StageKind }[]): number {
  let total = BigInt(0);
  for (const d of deals) {
    if (d.kind !== "open" || !d.value_cents) continue;
    total += (BigInt(d.value_cents) * BigInt(d.probability_bps) * BigInt(2) + BigInt(10_000)) / BigInt(20_000);
  }
  return Number(total);
}

export type FollowUpState = "overdue" | "today" | "soon" | "later" | "none";
export function followUpState(date: string | null, today: string, soonDays = 3): FollowUpState {
  if (!date) return "none";
  if (date < today) return "overdue";
  if (date === today) return "today";
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= soonDays ? "soon" : "later";
}
