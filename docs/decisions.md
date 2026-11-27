# Decisions log

## 2026-11-27: Phase 1 foundation

- **Stack:** Next.js 16.4 (App Router), React 19.3, TypeScript, Tailwind 4, npm. Supabase for
  Postgres + Auth, Vercel for hosting, GitHub for code (owner-confirmed).
- **Reference project:** patterns reused from Mosaico OS (`~/code/mosaico-os`): deny-by-default
  proxy + per-page checks, integer-cents money rule, decisions log, mobile menu behavior,
  "AI suggests, people approve". Mosaico's Clerk/Neon/Drizzle stack and its branding are **not** used.
- **Brand:** Güfi only. Owner: pink, white and light pink; no black. Details in `brand.md`.
- **Database access:** `@supabase/ssr` with the user's session everywhere in the app; SQL
  migrations in `supabase/migrations`; RLS as the source of truth for permissions.
  `src/types/database.ts` is hand-written until the project is linked, then generated.
- **Roles:** `admin`, `project_manager`, `team`, `finance`, `marketing` (AGENTS.md §7). The future
  `client` role is not added until the client portal.
- **No money on projects yet:** contract values and budgets need finance-only visibility; they'll
  get their own table with stricter RLS in the finance phase rather than a column every team
  member could read.
- **Next.js `cacheComponents` is off:** every workspace page is per-user and dynamic.
- **Tests without Docker:** PGlite runs the real migrations in memory, so RLS is tested on every
  `npm test`. The Supabase CLI (`npx supabase`) is a dev dependency for linking, pushing
  migrations and generating types.
- **Invitations by script** for now (`npm run invite`); in-app invitations next.
- **Güfi AI panel** exists but states it isn't connected; no model provider chosen yet
  (AGENTS.md proposes OpenAI; Mosaico used Anthropic; decide with the founders).

## Open decisions

- Default time zone and currency for Güfi (bootstrap flags; changeable in Settings).
- Custom SMTP provider for Supabase Auth emails.
- AI model provider.
- Accounting system of record (QuickBooks or native) before the finance phase.

## 2026-11-27: Finance snapshot from the 2026 partners' summary

- **QuickBooks Online (Gufi S.A.) stays the system of record.** Güfi OS stores imported,
  dated, source-labeled figures (`financial_snapshots`, `project_finances`); it is not a ledger.
  Every screen says "imported snapshot, not live".
- **Per-project finances** (`project_finances`): contract before tax, ITBMS rate (7% where the
  source gives it; null = not in source), collected, outstanding, invoice ref, payment due date.
  A database check enforces outstanding = contract + tax − collected whenever all are known.
- **The 15/60/25 split is first-class:** `partners` (may exist before they have an account),
  `project_splits` (who brought / who did, with shares), `partner_payouts`. Amounts are computed
  with BigInt half-up rounding (`src/features/finance/split.ts`), tested against the PDF.
- **Who sees what:** project figures → admin, finance, project manager. Partner split and pay →
  admins only (owner decision: visible to all admins). Company snapshot → admin and finance.
  The delivery team and marketing see no money.
- **Imports:** `npm run import:summary -- --file imports/<file>.json [--apply]`. Dry run by
  default; consistency checks against the source's own totals; idempotent. Files in `imports/`
  are gitignored so financial data never reaches GitHub.
- **Pending:** invite Daniel, Camila (partners) and Ernesto when the owner says so; link their
  accounts to their partner rows.
