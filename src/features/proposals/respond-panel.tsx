"use client";

// The client's accept / decline panel on the public link.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { respondToProposalAction } from "./actions";
import { LABELS, totals, type PublicProposal } from "./model";

const field = "w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:border-brand";

export function RespondPanel({ token, doc }: { token: string; doc: PublicProposal }) {
  const L = LABELS[doc.language];
  const router = useRouter();
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const optional = doc.items.filter((i) => i.optional);
  const t = totals(doc.items, doc.tax_rate_bps, selected);
  const money = (c: number) => formatMoney({ cents: c, currency: doc.currency });

  return (
    <section aria-labelledby="respond-title" className="no-print gufi-corner mx-auto mt-8 max-w-[820px] border border-border-strong bg-card p-6 shadow-pop sm:p-8">
      <h2 id="respond-title" className="display text-2xl font-bold">
        {L.acceptTitle}
      </h2>
      <div className="mt-4 flex gap-1 rounded-lg border border-border bg-muted p-1 text-sm" role="tablist">
        {(["accept", "decline"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className="flex-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-card"
          >
            {m === "accept" ? L.accept : L.decline}
          </button>
        ))}
      </div>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            const res = await respondToProposalAction(token, {
              decision: mode === "accept" ? "accepted" : "declined",
              name: String(f.get("name") ?? ""),
              email: String(f.get("email") ?? ""),
              title: String(f.get("title") ?? ""),
              reason: String(f.get("reason") ?? ""),
              selected: mode === "accept" ? selected : [],
              agreed: f.get("agree") === "on",
            });
            if (res.ok) router.refresh();
            else setError(res.message);
          });
        }}
      >
        {mode === "accept" && optional.length > 0 && (
          <fieldset className="rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-semibold">{L.optional}</legend>
            {optional.map((i) => (
              <label key={i.id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(i.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))}
                  />
                  {i.name}
                </span>
                <span className="tabular shrink-0">+ {money(i.line_total_cents)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {mode === "accept" && (
          <p className="tabular flex justify-between rounded-md bg-pink-50 px-4 py-3 text-base font-bold">
            <span>{L.grandTotal}</span>
            <span>{money(t.total)}</span>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[13px] font-semibold">{L.name}</span>
            <input name="name" required autoComplete="name" className={`${field} h-10`} />
          </label>
          <label>
            <span className="mb-1 block text-[13px] font-semibold">{L.email}</span>
            <input name="email" type="email" required autoComplete="email" className={`${field} h-10`} />
          </label>
          {mode === "accept" && (
            <label>
              <span className="mb-1 block text-[13px] font-semibold">{L.role}</span>
              <input name="title" autoComplete="organization-title" className={`${field} h-10`} />
            </label>
          )}
        </div>
        {mode === "decline" && (
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold">{L.declineReason}</span>
            <textarea name="reason" rows={3} className={`${field} py-2`} />
          </label>
        )}
        {mode === "accept" && (
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="agree" required className="mt-1" />
            <span>{L.agree}</span>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/8 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`h-11 w-full rounded-md text-sm font-semibold disabled:opacity-60 ${mode === "accept" ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border-strong bg-card hover:bg-accent"}`}
        >
          {pending ? "…" : mode === "accept" ? L.accept : L.decline}
        </button>
      </form>
    </section>
  );
}
