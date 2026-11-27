// Draft a proposal with Claude. Returns suggestions only; nothing is saved here. The editor
// shows them for review and the person decides what to keep.
import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getWorkspace } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, claude, CLAUDE_MODEL, logAiRun } from "@/lib/ai/claude";
import { DraftSchema, systemPrompt, userPrompt } from "@/features/proposals/ai-draft";
import { SECTION_KEYS } from "@/features/proposals/model";
import { sectionsOf } from "@/features/proposals/queries";

export const maxDuration = 300;

const Body = z.object({
  notes: z.string().max(60_000),
  instructions: z.string().max(2_000).default(""),
});

export async function POST(request: NextRequest, ctx: RouteContext<"/api/proposals/[id]/draft">) {
  const ws = await getWorkspace();
  if (!ws) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!can(ws.role, "pipeline:write")) return NextResponse.json({ error: "Your role can't edit proposals." }, { status: 403 });
  if (!aiConfigured()) return NextResponse.json({ error: "Claude isn't connected yet (missing API key)." }, { status: 503 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Unknown proposal." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "The notes are too long (60,000 characters max)." }, { status: 400 });
  if (!body.data.notes.trim() && !body.data.instructions.trim()) return NextResponse.json({ error: "Paste some notes or write what you need first." }, { status: 400 });

  // Everything below is read through the person's own session, so RLS limits what Claude sees.
  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, title, language, client:clients(name, industry, domain, notes), opportunity:opportunities(title, value_cents, notes, source_detail)")
    .eq("organization_id", ws.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Unknown proposal." }, { status: 404 });
  const { data: latest } = await supabase
    .from("proposal_versions")
    .select("content, locked_at")
    .eq("proposal_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || latest.locked_at) return NextResponse.json({ error: "This version was already sent. Create a new revision to draft changes." }, { status: 409 });

  const client = proposal.client as unknown as { name: string; industry: string | null; domain: string | null; notes: string | null };
  const deal = proposal.opportunity as unknown as { title: string; value_cents: number | null; notes: string | null; source_detail: string | null } | null;
  const lang = proposal.language;

  const started = performance.now();
  let response;
  try {
    response = await claude().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(DraftSchema) },
      system: systemPrompt(lang),
      messages: [
        {
          role: "user",
          content: userPrompt({
            lang,
            proposalTitle: proposal.title,
            client,
            deal: deal
              ? { title: deal.title, value_usd: deal.value_cents !== null ? (deal.value_cents / 100).toFixed(2) : null, notes: deal.notes, source_detail: deal.source_detail }
              : null,
            existing: Object.fromEntries(sectionsOf(latest.content).map((s) => [s.key, s.body])),
            notes: body.data.notes,
            instructions: body.data.instructions,
          }),
        },
      ],
    });
  } catch (e) {
    const message =
      e instanceof Anthropic.RateLimitError
        ? "Claude is busy right now. Try again in a minute."
        : e instanceof Anthropic.AuthenticationError
          ? "Claude's API key isn't valid. An admin needs to check ANTHROPIC_API_KEY."
          : e instanceof Anthropic.APIError
            ? `Claude couldn't draft this (${e.status ?? "error"}). Try again.`
            : "Claude couldn't draft this. Try again.";
    await logAiRun({
      organizationId: ws.organization.id,
      userId: ws.user.id,
      feature: "proposal.draft",
      subjectType: "proposal",
      subjectId: id,
      status: "failed",
      durationMs: performance.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const durationMs = performance.now() - started;
  const base = { organizationId: ws.organization.id, userId: ws.user.id, feature: "proposal.draft", subjectType: "proposal", subjectId: id, usage: response.usage, durationMs, requestId: response._request_id };

  if (response.stop_reason === "refusal") {
    await logAiRun({ ...base, status: "refused", error: response.stop_details?.category ?? "refusal" });
    return NextResponse.json({ error: "Claude declined to draft from this material. Try rephrasing the notes." }, { status: 422 });
  }
  const parsed = response.parsed_output ? DraftSchema.safeParse(response.parsed_output) : null;
  if (!parsed?.success) {
    await logAiRun({ ...base, status: "failed", error: response.stop_reason === "max_tokens" ? "max_tokens" : "unparseable output" });
    return NextResponse.json({ error: "Claude's draft came back incomplete. Try again with shorter notes." }, { status: 502 });
  }
  await logAiRun({ ...base, status: "succeeded" });

  // Shape it for the editor (strings, as typed in the form), with sane limits.
  const d = parsed.data;
  return NextResponse.json({
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, (d.sections[k] ?? "").trim().slice(0, 20000)])),
    items: d.items.slice(0, 30).map((i) => ({
      name: i.name.trim().slice(0, 200) || "—",
      description: i.description.trim().slice(0, 2000),
      quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? String(Math.round(i.quantity * 100) / 100) : "1",
      unit_price: i.unit_price_usd !== null && Number.isFinite(i.unit_price_usd) && i.unit_price_usd >= 0 ? i.unit_price_usd.toFixed(2) : "",
      price_source: i.price_source,
    })),
    open_questions: d.open_questions.map((q) => q.trim()).filter(Boolean).slice(0, 15),
  });
}
