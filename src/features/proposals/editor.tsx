"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, Plus, Send, Trash, TriangleExclamationPoint } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { parseMoneyToCents } from "@/features/pipeline/model";
import { saveDraftAction, sendProposalAction } from "./actions";
import { lineTotalCents, parsePercent, parseQuantity, readyToSend, scheduleAmounts, SECTION_HINTS, SECTION_KEYS, SECTION_TITLES, taxCents, type Lang, type SectionKey } from "./model";

type Item = { key: string; name: string; description: string; quantity: string; unit_price: string; optional: boolean };
type Milestone = { key: string; label: string; percent: string; due: string };
export type EditorInitial = {
  title: string;
  language: Lang;
  tax_rate_bps: number;
  valid_until: string;
  sections: Record<SectionKey, string>;
  items: Omit<Item, "key">[];
  milestones: Omit<Milestone, "key">[];
};

let seq = 0;
const k = () => `row-${++seq}`;
const input = "w-full rounded-md border border-input bg-card px-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:border-brand aria-[invalid=true]:border-status-critical";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

export function ProposalEditor({ proposalId, versionId, initial, today, currency }: { proposalId: string; versionId: string; initial: EditorInitial; today: string; currency: string }) {
  const [title, setTitle] = useState(initial.title);
  const [language, setLanguage] = useState<Lang>(initial.language);
  const [taxBps, setTaxBps] = useState(initial.tax_rate_bps);
  const [validUntil, setValidUntil] = useState(initial.valid_until);
  const [sections, setSections] = useState(initial.sections);
  const [items, setItems] = useState<Item[]>(() => initial.items.map((i) => ({ ...i, key: k() })));
  const [milestones, setMilestones] = useState<Milestone[]>(() => initial.milestones.map((m) => ({ ...m, key: k() })));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string; issues?: { path: (string | number)[]; message: string }[] } | null>(null);
  const [saving, startSaving] = useTransition();
  const [sending, startSending] = useTransition();
  const sendDialog = useRef<HTMLDialogElement>(null);
  const money = (c: number) => formatMoney({ cents: c, currency });

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Live totals (same math as the database).
  const calc = useMemo(() => {
    let subtotal = 0;
    let optional = 0;
    for (const it of items) {
      const q = parseQuantity(it.quantity);
      const p = parseMoneyToCents(it.unit_price);
      if (q === "invalid" || p === "invalid" || p === null) continue;
      const line = lineTotalCents(p, q);
      if (it.optional) optional += line;
      else subtotal += line;
    }
    const tax = taxCents(subtotal, taxBps);
    const bps = milestones.map((m) => parsePercent(m.percent)).map((b) => (b === "invalid" ? 0 : b));
    return { subtotal, tax, total: subtotal + tax, optional, scheduleSum: bps.reduce((a, b) => a + b, 0), payments: scheduleAmounts(subtotal + tax, bps) };
  }, [items, milestones, taxBps]);

  const problems = readyToSend(
    { items: items.map((i) => ({ optional: i.optional })), milestones: milestones.map((m) => ({ percent_bps: parsePercent(m.percent) === "invalid" ? 0 : (parsePercent(m.percent) as number) })), valid_until: validUntil || null },
    today,
  );
  const issueFor = (path: (string | number)[]) => status?.issues?.find((i) => i.path.join(".") === path.join("."))?.message;

  const payload = () =>
    JSON.stringify({
      title,
      language,
      tax_rate_bps: taxBps,
      valid_until: validUntil,
      sections: SECTION_KEYS.map((key) => ({ key, body: sections[key] ?? "" })),
      items: items.map((it) => ({ name: it.name, description: it.description, quantity: it.quantity, unit_price: it.unit_price, optional: it.optional })),
      milestones: milestones.map((m) => ({ label: m.label, percent: m.percent, due: m.due })),
    });

  const save = (then?: () => void) =>
    startSaving(async () => {
      const res = await saveDraftAction(proposalId, versionId, payload());
      if (res.ok) {
        setDirty(false);
        setStatus({ tone: "ok", text: `Saved at ${new Date(res.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` });
        then?.();
      } else setStatus({ tone: "error", text: res.message, issues: res.issues });
    });

  const send = () => {
    sendDialog.current?.close();
    save(() =>
      startSending(async () => {
        const res = await sendProposalAction(proposalId, versionId);
        if (res && !res.ok) setStatus({ tone: "error", text: res.problems.join(" ") });
      }),
    );
  };

  const moveItem = (i: number, d: -1 | 1) =>
    touch(setItems)(((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    })(items));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-6">
        {/* Settings */}
        <section className="rounded-lg border border-border bg-card p-5 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>Title (shown on the cover)</span>
              <input className={`${input} h-10 text-base font-semibold`} value={title} onChange={(e) => touch(setTitle)(e.target.value)} aria-invalid={Boolean(issueFor(["title"]))} />
              {issueFor(["title"]) && <span className="mt-1 block text-xs text-status-critical">{issueFor(["title"])}</span>}
            </label>
            <label>
              <span className={label}>Proposal language</span>
              <select className={`${input} h-10`} value={language} onChange={(e) => touch(setLanguage)(e.target.value as Lang)}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <span className={label}>ITBMS</span>
              <select className={`${input} h-10`} value={taxBps} onChange={(e) => touch(setTaxBps)(Number(e.target.value))}>
                <option value={700}>7% (Panama)</option>
                <option value={0}>0% (foreign client / exempt)</option>
              </select>
            </label>
            <label>
              <span className={label}>Valid until</span>
              <input type="date" className={`${input} h-10`} value={validUntil} onChange={(e) => touch(setValidUntil)(e.target.value)} />
            </label>
          </div>
        </section>

        {/* Sections */}
        <section className="rounded-lg border border-border bg-card shadow-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-bold">Content</h2>
            <p className="text-[13px] text-muted-foreground">Empty sections are left out. Blank line = new paragraph; start lines with &quot;- &quot; for bullets.</p>
          </header>
          <div className="space-y-5 p-5">
            {SECTION_KEYS.map((key) => (
              <label key={key} className="block">
                <span className="mb-1 block text-sm font-semibold">{SECTION_TITLES[language][key]}</span>
                <textarea
                  rows={key === "summary" ? 3 : 4}
                  className={`${input} py-2 leading-relaxed`}
                  placeholder={SECTION_HINTS[key]}
                  value={sections[key] ?? ""}
                  onChange={(e) => touch(setSections)({ ...sections, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </section>

        {/* Line items */}
        <section className="rounded-lg border border-border bg-card shadow-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-bold">Investment</h2>
            <p className="text-[13px] text-muted-foreground">Prices in {currency}, before ITBMS. Optional add-ons aren&apos;t in the total; the client can choose them when accepting.</p>
          </header>
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <li key={it.key} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_auto]">
                <div className="space-y-2">
                  <input
                    aria-label={`Line ${i + 1} name`}
                    placeholder="Shopify store build"
                    className={`${input} h-9 font-semibold`}
                    value={it.name}
                    aria-invalid={Boolean(issueFor(["items", i, "name"]))}
                    onChange={(e) => touch(setItems)(items.map((x) => (x.key === it.key ? { ...x, name: e.target.value } : x)))}
                  />
                  <textarea
                    aria-label={`Line ${i + 1} description`}
                    placeholder="What's included (optional)"
                    rows={2}
                    className={`${input} py-1.5 text-[13px]`}
                    value={it.description}
                    onChange={(e) => touch(setItems)(items.map((x) => (x.key === it.key ? { ...x, description: e.target.value } : x)))}
                  />
                  <label className="inline-flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={it.optional} onChange={(e) => touch(setItems)(items.map((x) => (x.key === it.key ? { ...x, optional: e.target.checked } : x)))} />
                    Optional add-on
                  </label>
                </div>
                <label>
                  <span className={label}>Qty</span>
                  <input
                    inputMode="decimal"
                    className={`${input} tabular h-9 text-right`}
                    value={it.quantity}
                    aria-invalid={Boolean(issueFor(["items", i, "quantity"]))}
                    onChange={(e) => touch(setItems)(items.map((x) => (x.key === it.key ? { ...x, quantity: e.target.value } : x)))}
                  />
                </label>
                <label>
                  <span className={label}>Price</span>
                  <input
                    inputMode="decimal"
                    placeholder="1,850.00"
                    className={`${input} tabular h-9 text-right`}
                    value={it.unit_price}
                    aria-invalid={Boolean(issueFor(["items", i, "unit_price"]))}
                    onChange={(e) => touch(setItems)(items.map((x) => (x.key === it.key ? { ...x, unit_price: e.target.value } : x)))}
                  />
                  {(() => {
                    const q = parseQuantity(it.quantity);
                    const p = parseMoneyToCents(it.unit_price);
                    return q !== "invalid" && p !== "invalid" && p !== null ? <span className="tabular mt-1 block text-right text-xs text-muted-foreground">{money(lineTotalCents(p, q))}</span> : null;
                  })()}
                </label>
                <div className="flex items-start gap-1 pt-5">
                  <button type="button" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label={`Move line ${i + 1} up`} className="flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30">
                    <ArrowUp aria-hidden className="size-4" />
                  </button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label={`Move line ${i + 1} down`} className="flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30">
                    <ArrowDown aria-hidden className="size-4" />
                  </button>
                  <button type="button" onClick={() => touch(setItems)(items.filter((x) => x.key !== it.key))} aria-label={`Remove line ${i + 1}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-status-critical">
                    <Trash aria-hidden className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-4">
            <button
              type="button"
              onClick={() => touch(setItems)([...items, { key: k(), name: "", description: "", quantity: "1", unit_price: "", optional: false }])}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
            >
              <Plus aria-hidden className="size-4" /> Add a line
            </button>
          </div>
        </section>

        {/* Payment schedule */}
        <section className="rounded-lg border border-border bg-card shadow-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-bold">Payment schedule</h2>
            <p className={`text-[13px] ${calc.scheduleSum === 10000 ? "text-muted-foreground" : "font-semibold text-status-critical"}`}>
              {calc.scheduleSum === 10000 ? "Adds up to 100%." : `Adds up to ${calc.scheduleSum / 100}%. It must be 100%.`}
            </p>
          </header>
          <ul className="divide-y divide-border">
            {milestones.map((m, i) => (
              <li key={m.key} className="grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_7rem_auto]">
                <label>
                  <span className={label}>Payment</span>
                  <input className={`${input} h-9`} value={m.label} onChange={(e) => touch(setMilestones)(milestones.map((x) => (x.key === m.key ? { ...x, label: e.target.value } : x)))} />
                </label>
                <label>
                  <span className={label}>%</span>
                  <input
                    inputMode="decimal"
                    className={`${input} tabular h-9 text-right`}
                    value={m.percent}
                    aria-invalid={Boolean(issueFor(["milestones", i, "percent"]))}
                    onChange={(e) => touch(setMilestones)(milestones.map((x) => (x.key === m.key ? { ...x, percent: e.target.value } : x)))}
                  />
                </label>
                <label>
                  <span className={label}>When</span>
                  <input className={`${input} h-9`} value={m.due} onChange={(e) => touch(setMilestones)(milestones.map((x) => (x.key === m.key ? { ...x, due: e.target.value } : x)))} />
                </label>
                <span className="tabular pb-2 text-right text-sm text-muted-foreground">{money(calc.payments[i] ?? 0)}</span>
                <button type="button" onClick={() => touch(setMilestones)(milestones.filter((x) => x.key !== m.key))} aria-label={`Remove payment ${i + 1}`} className="mb-0.5 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-status-critical">
                  <Trash aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-4">
            <button type="button" onClick={() => touch(setMilestones)([...milestones, { key: k(), label: "", percent: "", due: "" }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
              <Plus aria-hidden className="size-4" /> Add a payment
            </button>
          </div>
        </section>
      </div>

      {/* Side panel */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{money(calc.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">ITBMS {taxBps / 100}%</dt>
              <dd>{money(calc.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-lg font-bold">
              <dt>Total</dt>
              <dd>{money(calc.total)}</dd>
            </div>
            {calc.optional > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <dt>Optional add-ons</dt>
                <dd>+ {money(calc.optional)}</dd>
              </div>
            )}
          </dl>

          {status && (
            <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-[13px] ${status.tone === "error" ? "bg-status-critical/8 text-status-critical" : "bg-status-good/8 text-status-good"}`}>
              {status.text}
            </p>
          )}
          {dirty && <p className="text-xs font-semibold text-status-warning">Unsaved changes</p>}

          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => save()} disabled={saving || sending} className="h-10 rounded-md border border-border-strong bg-card text-sm font-semibold hover:bg-accent disabled:opacity-60">
              {saving ? "Saving…" : "Save draft"}
            </button>
            <Link
              href={`/proposals/${proposalId}/preview`}
              target="_blank"
              onClick={(e) => {
                if (dirty) {
                  e.preventDefault();
                  save(() => window.open(`/proposals/${proposalId}/preview`, "_blank"));
                }
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold text-link hover:bg-accent"
            >
              <Eye aria-hidden className="size-4" /> Preview
            </Link>
            <button
              type="button"
              disabled={problems.length > 0 || saving || sending}
              onClick={() => sendDialog.current?.showModal()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              <Send aria-hidden className="size-4" /> {sending ? "Sending…" : "Send to client"}
            </button>
          </div>

          {problems.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <li className="font-semibold text-foreground">Before sending:</li>
              {problems.map((p) => (
                <li key={p} className="flex gap-1.5">
                  <TriangleExclamationPoint aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <dialog ref={sendDialog} aria-labelledby="send-title" className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-[#3d1426]/25">
        <div className="p-5">
          <h2 id="send-title" className="text-base font-bold">
            Send this proposal?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This version will be locked (changes need a new revision) and you&apos;ll get a secure link to send the client. If it&apos;s linked to a deal, the deal moves to
            &quot;Proposal sent&quot;.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => sendDialog.current?.close()} className="h-10 rounded-md px-4 text-sm font-semibold hover:bg-accent">
              Cancel
            </button>
            <button type="button" onClick={send} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              Lock and create link
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
