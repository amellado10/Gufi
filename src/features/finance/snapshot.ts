// Shapes of imported financial snapshots (public.financial_snapshots.data). Validated on import
// and again on read, so a malformed row can never render as numbers.
import { z } from "zod";

const cents = z.number().int();
const nonNeg = cents.nonnegative();
const label = z.string().min(1).max(120);

export const companySnapshotData = z.object({
  headline: z.object({
    revenue_cents: nonNeg,
    project_revenue_cents: nonNeg,
    other_revenue: z.array(z.object({ label, cents: nonNeg })),
    net_result_cents: cents,
    net_result_note: z.string().max(300),
    receivables_cents: nonNeg,
    receivables_projects: z.number().int().nonnegative(),
    bank_balance_cents: nonNeg,
    bank_reconciled_on: z.iso.date(),
    bank_owed_to_partners_cents: nonNeg,
    bank_tax_approx_cents: nonNeg,
  }),
  monthly_revenue: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), cents: nonNeg, partial: z.boolean().default(false) })),
  revenue_by_client: z.array(z.object({ label, cents: nonNeg, note: z.string().max(200).optional() })),
  costs: z.object({
    total_cents: nonNeg,
    cost_of_sales_cents: nonNeg,
    expenses_cents: nonNeg,
    gross_margin_cents: cents,
    categories: z.array(z.object({ label, cents: nonNeg, group: z.enum(["cost_of_sales", "expense"]), note: z.string().max(200).optional() })),
  }),
  open_items: z.array(z.object({ title: label, detail: z.string().max(400) })),
  rounding_note: z.string().max(300),
});
export type CompanySnapshotData = z.infer<typeof companySnapshotData>;

export const partnerSnapshotData = z.object({
  due_from_collected: z.array(z.object({ partner: label, cents: nonNeg })),
  note: z.string().max(400),
});
export type PartnerSnapshotData = z.infer<typeof partnerSnapshotData>;

// ── Import file (imports/*.json, kept out of git) ────────────────────────────

const splitRole = z.enum(["origination", "delivery"]);

export const importFile = z.object({
  organization_slug: z.string(),
  as_of: z.iso.date(),
  source: z.string().min(1).max(300),
  partners: z.array(z.object({ name: label, email: z.email().optional() })),
  clients: z.array(
    z.object({
      name: label,
      legal_name: z.string().max(200).optional(),
      status: z.enum(["prospect", "active", "inactive"]),
      notes: z.string().max(2000).optional(),
    }),
  ),
  projects: z.array(
    z.object({
      client: label,
      name: label,
      status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
      due_date: z.iso.date().optional(),
      description: z.string().max(2000).optional(),
      finance: z.object({
        contract_cents: nonNeg,
        tax_rate_bps: z.number().int().min(0).max(10000).nullable(),
        collected_cents: nonNeg.nullable(),
        outstanding_cents: nonNeg,
        invoice_ref: z.string().max(60).optional(),
        payment_due_date: z.iso.date().optional(),
        notes: z.string().max(2000).optional(),
      }),
      splits: z.array(z.object({ partner: label, role: splitRole, share_bps: z.number().int().min(1).max(10000) })),
    }),
  ),
  payouts: z.array(
    z.object({
      key: z.string().regex(/^[a-z0-9-]{3,80}$/),
      partner: label,
      amount_cents: cents.positive(),
      paid_month: z.string().regex(/^\d{4}-\d{2}-01$/).nullable(),
      description: z.string().min(1).max(300),
    }),
  ),
  snapshots: z.array(
    z.discriminatedUnion("audience", [
      z.object({
        key: z.string().regex(/^[a-z0-9-]{3,80}$/),
        title: label,
        basis: z.enum(["accrual", "cash"]),
        period_start: z.iso.date(),
        period_end: z.iso.date(),
        reconciled_through: z.iso.date().optional(),
        audience: z.literal("finance"),
        data: companySnapshotData,
      }),
      z.object({
        key: z.string().regex(/^[a-z0-9-]{3,80}$/),
        title: label,
        basis: z.enum(["accrual", "cash"]),
        period_start: z.iso.date(),
        period_end: z.iso.date(),
        reconciled_through: z.iso.date().optional(),
        audience: z.literal("admins"),
        data: partnerSnapshotData,
      }),
    ]),
  ),
});
export type ImportFile = z.infer<typeof importFile>;
