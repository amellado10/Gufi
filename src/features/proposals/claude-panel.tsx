"use client";

// "Draft with Claude": sends pasted notes to the server, which asks Claude for a draft.
// Nothing is saved: suggestions land in the editor as unsaved changes for the person to review.
import { useState } from "react";
import { CircleQuestionMark, Sparkles } from "lucide-react";
import type { SectionKey } from "./model";

export type DraftResult = {
  sections: Record<SectionKey, string>;
  items: { name: string; description: string; quantity: string; unit_price: string; price_source: "notes" | "deal_value" | "none" }[];
  open_questions: string[];
};

export function ClaudePanel({
  proposalId,
  enabled,
  onDraft,
}: {
  proposalId: string;
  enabled: boolean;
  onDraft: (draft: DraftResult, opts: { replaceSections: boolean; addItems: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [replace, setReplace] = useState(false);
  const [addItems, setAddItems] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, instructions }),
      });
      const json = await res.json().catch(() => ({ error: "Unexpected response." }));
      if (!res.ok) {
        setError(json.error ?? "Claude couldn't draft this.");
        return;
      }
      const draft = json as DraftResult;
      onDraft(draft, { replaceSections: replace, addItems });
      setQuestions(draft.open_questions);
      const unpriced = draft.items.filter((i) => !i.unit_price).length;
      setDone(
        `Draft added to the editor. Review it, then Save draft.${addItems && draft.items.length ? ` ${draft.items.length} line item${draft.items.length === 1 ? "" : "s"} suggested${unpriced ? `, ${unpriced} without a price` : ""}.` : ""}`,
      );
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <section className="rounded-lg border border-dashed border-border-strong bg-card px-5 py-4 text-sm text-muted-foreground">
        <Sparkles aria-hidden className="mr-1.5 inline size-4 text-brand" />
        Claude drafting isn&apos;t connected yet (an admin needs to add the Anthropic API key).
      </section>
    );
  }

  return (
    <section className="gufi-corner border border-border-strong bg-gradient-to-br from-pink-50 to-card p-5 shadow-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <Sparkles aria-hidden className="size-4 text-brand" /> Draft with Claude
          </span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">Paste meeting notes, a brief or an email thread. Claude drafts the sections and suggests line items; you review everything before sending.</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-link">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3" aria-busy={busy}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Notes, brief, transcript or emails</span>
            <textarea
              rows={7}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={60000}
              placeholder="Paste anything about what the client needs: goals, pages, products, integrations, budget, deadline…"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Anything specific? (optional)</span>
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={2000}
              placeholder="e.g. Emphasize B2B wholesale, keep it short, two phases"
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:border-brand"
            />
          </label>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace sections I&apos;ve already written
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={addItems} onChange={(e) => setAddItems(e.target.checked)} />
              Add suggested line items
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={busy || (!notes.trim() && !instructions.trim())}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              <Sparkles aria-hidden className={`size-4 ${busy ? "animate-pulse motion-reduce:animate-none" : ""}`} />
              {busy ? "Claude is drafting… (up to a minute)" : "Draft"}
            </button>
            <span className="text-xs text-muted-foreground">Claude only uses prices from your notes or the deal&apos;s value, and lists what it needs to know.</span>
          </div>
          <p role="status" aria-live="polite" className="text-sm">
            {done && <span className="font-medium text-status-good">{done}</span>}
          </p>
          {error && (
            <p role="alert" className="rounded-md bg-status-critical/8 px-3 py-2 text-sm text-status-critical">
              {error}
            </p>
          )}
          {questions.length > 0 && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CircleQuestionMark aria-hidden className="size-4 text-brand" /> Claude needs to know
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
