// Proposal structure, labels (Spanish/English), validation and totals.
// Totals mirror the database exactly: line = round_half_up(unit × qty/100); tax = round_half_up(subtotal × rate).
import { z } from "zod";
import type { Enums } from "@/types/database";
import { parseMoneyToCents } from "@/features/pipeline/model";

export type Lang = "es" | "en";
export type ProposalStatus = Enums<"proposal_status">;

export const SECTION_KEYS = ["summary", "objectives", "solution", "scope", "exclusions", "timeline", "terms"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLES: Record<Lang, Record<SectionKey, string>> = {
  es: {
    summary: "Resumen ejecutivo",
    objectives: "Objetivos",
    solution: "Solución recomendada",
    scope: "Alcance y entregables",
    exclusions: "No incluido",
    timeline: "Cronograma",
    terms: "Términos y condiciones",
  },
  en: {
    summary: "Executive summary",
    objectives: "Objectives",
    solution: "Recommended solution",
    scope: "Scope and deliverables",
    exclusions: "Not included",
    timeline: "Timeline",
    terms: "Terms and conditions",
  },
};

// Hints shown in the editor (internal, English), never rendered to the client.
export const SECTION_HINTS: Record<SectionKey, string> = {
  summary: "Two or three sentences: what the client gets and why it matters to their business.",
  objectives: "The client's goals in their words. One per line; start lines with \"- \" for bullets.",
  solution: "What Güfi recommends and why (platform, approach, integrations).",
  scope: "Deliverables, page counts, features, rounds of revisions. Use \"- \" bullets.",
  exclusions: "What's not part of this proposal (content writing, photography, paid apps…).",
  timeline: "Phases and approximate dates or durations.",
  terms: "Ownership, support period, change requests, validity, cancellation.",
};

export const LABELS: Record<Lang, Record<string, string>> = {
  es: {
    proposal: "Propuesta",
    preparedFor: "Preparada para",
    preparedBy: "Preparada por",
    date: "Fecha",
    validUntil: "Válida hasta",
    investment: "Inversión",
    item: "Concepto",
    qty: "Cant.",
    unitPrice: "Precio",
    total: "Total",
    subtotal: "Subtotal",
    tax: "ITBMS",
    grandTotal: "Total",
    optional: "Opcionales",
    optionalHint: "Puede agregarlos al aceptar.",
    paymentSchedule: "Forma de pago",
    acceptTitle: "Aceptar la propuesta",
    accept: "Acepto la propuesta",
    decline: "No vamos a continuar",
    name: "Nombre completo",
    email: "Correo electrónico",
    role: "Cargo",
    agree: "Confirmo que tengo autoridad para aceptar esta propuesta en nombre de la empresa y acepto el alcance, la inversión y la forma de pago descritos.",
    declineReason: "¿Nos cuenta por qué? (opcional)",
    accepted: "Propuesta aceptada",
    declined: "Propuesta rechazada",
    acceptedBy: "Aceptada por",
    declinedBy: "Respondida por",
    thanks: "¡Gracias! Nos pondremos en contacto para comenzar.",
    expired: "Esta propuesta expiró. Escríbanos para recibir una versión actualizada.",
    superseded: "Esta versión fue reemplazada por una más reciente.",
    download: "Descargar PDF",
    version: "Versión",
    selectedTotal: "Total con opcionales seleccionados",
  },
  en: {
    proposal: "Proposal",
    preparedFor: "Prepared for",
    preparedBy: "Prepared by",
    date: "Date",
    validUntil: "Valid until",
    investment: "Investment",
    item: "Item",
    qty: "Qty",
    unitPrice: "Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "ITBMS",
    grandTotal: "Total",
    optional: "Optional add-ons",
    optionalHint: "You can add them when accepting.",
    paymentSchedule: "Payment schedule",
    acceptTitle: "Accept the proposal",
    accept: "I accept the proposal",
    decline: "We won't move forward",
    name: "Full name",
    email: "Email",
    role: "Title",
    agree: "I confirm I'm authorized to accept this proposal on behalf of the company and I agree to the scope, investment and payment schedule described.",
    declineReason: "Could you tell us why? (optional)",
    accepted: "Proposal accepted",
    declined: "Proposal declined",
    acceptedBy: "Accepted by",
    declinedBy: "Answered by",
    thanks: "Thank you! We'll be in touch to get started.",
    expired: "This proposal has expired. Write to us for an updated version.",
    superseded: "This version was replaced by a newer one.",
    download: "Download PDF",
    version: "Version",
    selectedTotal: "Total with selected add-ons",
  },
};

export const STATUS_META: Record<ProposalStatus, { label: string; tone: "info" | "good" | "warning" | "neutral" | "critical" }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "info" },
  accepted: { label: "Accepted", tone: "good" },
  declined: { label: "Declined", tone: "critical" },
  expired: { label: "Expired", tone: "warning" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export const proposalNumber = (n: number) => `P-${String(n).padStart(4, "0")}`;

// ── Money ──────────────────────────────────────────────────────────────────

export function lineTotalCents(unitPriceCents: number, quantityHundredths: number) {
  return Number((BigInt(unitPriceCents) * BigInt(quantityHundredths) + BigInt(50)) / BigInt(100));
}
export function taxCents(subtotalCents: number, taxRateBps: number) {
  return Number((BigInt(subtotalCents) * BigInt(taxRateBps) + BigInt(5000)) / BigInt(10000));
}
export function totals(items: { unit_price_cents: number; quantity_hundredths: number; optional: boolean; id?: string }[], taxRateBps: number, selectedOptional: string[] = []) {
  const base = items.filter((i) => !i.optional || (i.id && selectedOptional.includes(i.id)));
  const subtotal = base.reduce((a, i) => a + lineTotalCents(i.unit_price_cents, i.quantity_hundredths), 0);
  const tax = taxCents(subtotal, taxRateBps);
  const optional = items.filter((i) => i.optional).reduce((a, i) => a + lineTotalCents(i.unit_price_cents, i.quantity_hundredths), 0);
  return { subtotal, tax, total: subtotal + tax, optional };
}

// Split a total across payments: each rounds half-up, and the last takes the remainder so the
// payments always add up to the total exactly.
export function scheduleAmounts(totalCents: number, percents: number[]): number[] {
  const out: number[] = [];
  let used = 0;
  percents.forEach((bps, i) => {
    const amount = i === percents.length - 1 && percents.reduce((a, b) => a + b, 0) === 10000 ? totalCents - used : Number((BigInt(totalCents) * BigInt(bps) + BigInt(5000)) / BigInt(10000));
    out.push(amount);
    used += amount;
  });
  return out;
}

// "1.5" → 150 hundredths
export function parseQuantity(input: string): number | "invalid" {
  const raw = input.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw)) return "invalid";
  const [w, f = ""] = raw.split(".");
  const n = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return n > 0 ? n : "invalid";
}

// ── Editor payload ─────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max).transform((v) => v.replace(/\r\n/g, "\n").trim());

export const editorPayload = z
  .object({
    title: z.string().trim().min(1, "Give the proposal a title.").max(200),
    language: z.enum(["es", "en"]),
    tax_rate_bps: z.number().int().min(0).max(10000),
    valid_until: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
    sections: z.array(z.object({ key: z.enum(SECTION_KEYS), body: text(20000) })).max(SECTION_KEYS.length),
    items: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Every line needs a name.").max(200),
          description: text(2000),
          quantity: z.string().max(12),
          unit_price: z.string().max(20),
          optional: z.boolean(),
        }),
      )
      .max(100),
    milestones: z
      .array(z.object({ label: z.string().trim().min(1, "Every payment needs a label.").max(120), percent: z.string().max(8), due: text(200) }))
      .max(12),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((it, i) => {
      if (parseQuantity(it.quantity) === "invalid") ctx.addIssue({ code: "custom", path: ["items", i, "quantity"], message: "Quantity like 1 or 2.5" });
      const price = parseMoneyToCents(it.unit_price);
      if (price === "invalid" || price === null) ctx.addIssue({ code: "custom", path: ["items", i, "unit_price"], message: "Price like 1,850.00" });
    });
    v.milestones.forEach((m, i) => {
      if (parsePercent(m.percent) === "invalid") ctx.addIssue({ code: "custom", path: ["milestones", i, "percent"], message: "A percentage like 50" });
    });
  });
export type EditorPayload = z.infer<typeof editorPayload>;

// "50" / "33.33" → basis points
export function parsePercent(input: string): number | "invalid" {
  const raw = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return "invalid";
  const [w, f = ""] = raw.split(".");
  const bps = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return bps > 0 && bps <= 10000 ? bps : "invalid";
}

// Problems that block sending (drafts may be incomplete).
export function readyToSend(p: { items: { optional: boolean }[]; milestones: { percent_bps: number }[]; valid_until: string | null }, today: string): string[] {
  const problems: string[] = [];
  if (!p.items.some((i) => !i.optional)) problems.push("Add at least one line item that isn't optional.");
  const sum = p.milestones.reduce((a, m) => a + m.percent_bps, 0);
  if (p.milestones.length === 0) problems.push("Add a payment schedule.");
  else if (sum !== 10000) problems.push(`The payment schedule adds up to ${sum / 100}%, not 100%.`);
  if (!p.valid_until) problems.push("Set a \"valid until\" date.");
  else if (p.valid_until < today) problems.push("The \"valid until\" date is in the past.");
  return problems;
}

export const DEFAULT_MILESTONES: Record<Lang, { label: string; percent_bps: number; due: string }[]> = {
  es: [
    { label: "Abono inicial", percent_bps: 5000, due: "Al firmar" },
    { label: "Saldo", percent_bps: 5000, due: "A la entrega" },
  ],
  en: [
    { label: "Deposit", percent_bps: 5000, due: "On signing" },
    { label: "Balance", percent_bps: 5000, due: "On delivery" },
  ],
};

// ── The public document (what get_shared_proposal returns) ──────────────────

export const publicProposal = z.object({
  number: z.number(),
  title: z.string(),
  language: z.enum(["es", "en"]),
  client_name: z.string(),
  organization_name: z.string(),
  version: z.number(),
  status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "expired", "superseded"]),
  currency: z.string(),
  tax_rate_bps: z.number(),
  valid_until: z.string().nullable(),
  sent_at: z.string().nullable(),
  content: z.object({ sections: z.array(z.object({ key: z.enum(SECTION_KEYS), body: z.string() })) }).catch({ sections: [] }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      quantity_hundredths: z.number(),
      unit_price_cents: z.number(),
      line_total_cents: z.number(),
      optional: z.boolean(),
    }),
  ),
  milestones: z.array(z.object({ label: z.string(), percent_bps: z.number(), due: z.string().nullable() })),
  response: z
    .object({
      decision: z.enum(["accepted", "declined"]),
      signer_name: z.string(),
      responded_at: z.string(),
      selected_optional_item_ids: z.array(z.string()),
      subtotal_cents: z.number().nullable(),
      tax_cents: z.number().nullable(),
      total_cents: z.number().nullable(),
    })
    .nullable()
    .optional(),
});
export type PublicProposal = z.infer<typeof publicProposal>;
