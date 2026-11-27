"use client";

// Per-project split (admins): 15% fixed for whoever brought the client, custom percentages for the
// team, and Güfi keeps the rest. Amounts update as you type; the server checks the same rules.
import { useState, useTransition } from "react";
import { Plus, Trash } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { saveProjectSplitAction } from "./actions";
import { ORIGINATION_BPS, percentOf, splitProblems, type SplitLine } from "./split";

type Row = { key: string; partnerId: string; percent: string };
let seq = 0;
const k = () => `split-${++seq}`;

function toBps(input: string): number | null {
  const raw = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const [w, f = ""] = raw.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

export function SplitEditor({
  projectId,
  contractCents,
  currency,
  partners,
  initial,
}: {
  projectId: string;
  contractCents: number;
  currency: string;
  partners: { value: string; label: string }[];
  initial: { origination: string | null; team: { partnerId: string; percentBps: number }[] };
}) {
  const [origination, setOrigination] = useState(initial.origination ?? "");
  const [rows, setRows] = useState<Row[]>(() => initial.team.map((t) => ({ key: k(), partnerId: t.partnerId, percent: String(t.percentBps / 100) })));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, start] = useTransition();
  const money = (c: number | bigint) => formatMoney({ cents: c, currency });

  const lines: SplitLine[] = [
    ...(origination ? [{ partnerId: origination, role: "origination" as const, percentBps: ORIGINATION_BPS }] : []),
    ...rows.filter((r) => r.partnerId).map((r) => ({ partnerId: r.partnerId, role: "delivery" as const, percentBps: toBps(r.percent) ?? 0 })),
  ];
  const badPercent = rows.some((r) => r.partnerId && toBps(r.percent) === null);
  const problems = [...(badPercent ? ["Use a percentage like 30 or 12.5."] : []), ...(rows.some((r) => !r.partnerId && r.percent) ? ["Choose a person for every row."] : []), ...splitProblems(lines)];
  const assigned = lines.reduce((a, l) => a + l.percentBps, 0);
  const assignedCents = lines.reduce((a, l) => a + percentOf(contractCents, l.percentBps), BigInt(0));
  const companyBps = 10_000 - assigned;
  const change = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
    setStatus(null);
  };

  const save = () =>
    start(async () => {
      const res = await saveProjectSplitAction(projectId, {
        origination: origination || null,
        team: rows.filter((r) => r.partnerId).map((r) => ({ partnerId: r.partnerId, percentBps: toBps(r.percent) ?? 0 })),
      });
      if (res.ok) {
        setDirty(false);
        setStatus({ ok: true, text: "Split saved." });
      } else setStatus({ ok: false, text: res.message });
    });

  const select = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm focus-visible:border-brand";

  return (
    <div className="space-y-4 p-5">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Brought the client (15%)</span>
          <select className={select} value={origination} onChange={(e) => change(setOrigination)(e.target.value)}>
            <option value="">Güfi / nobody (15% stays with Güfi)</option>
            {partners.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular pb-2 text-right text-sm text-muted-foreground">{origination ? "15%" : "0%"}</span>
        <span className="tabular pb-2 text-right text-sm font-semibold">{money(origination ? percentOf(contractCents, ORIGINATION_BPS) : 0)}</span>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Did the work (% of the contract)</p>
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const bps = toBps(r.percent);
            return (
              <li key={r.key} className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]">
                <select
                  aria-label={`Team member ${i + 1}`}
                  className={select}
                  value={r.partnerId}
                  onChange={(e) => change(setRows)(rows.map((x) => (x.key === r.key ? { ...x, partnerId: e.target.value } : x)))}
                >
                  <option value="">Choose a person</option>
                  {partners.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <label className="relative">
                  <span className="sr-only">Percent for team member {i + 1}</span>
                  <input
                    inputMode="decimal"
                    value={r.percent}
                    onChange={(e) => change(setRows)(rows.map((x) => (x.key === r.key ? { ...x, percent: e.target.value } : x)))}
                    aria-invalid={r.partnerId && bps === null ? true : undefined}
                    className="tabular h-9 w-full rounded-md border border-input bg-card pl-2.5 pr-6 text-right text-sm focus-visible:border-brand aria-[invalid=true]:border-status-critical"
                  />
                  <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </label>
                <span className="tabular text-right text-sm font-semibold">{bps !== null ? money(percentOf(contractCents, bps)) : "—"}</span>
                <button
                  type="button"
                  onClick={() => change(setRows)(rows.filter((x) => x.key !== r.key))}
                  aria-label={`Remove team member ${i + 1}`}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-status-critical"
                >
                  <Trash aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => change(setRows)([...rows, { key: k(), partnerId: "", percent: "" }])}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-3 text-[13px] font-semibold hover:bg-accent"
        >
          <Plus aria-hidden className="size-3.5" /> Add a person
        </button>
      </div>

      <div className={`flex items-baseline justify-between gap-2 rounded-md px-4 py-3 text-sm ${companyBps < 0 ? "bg-status-critical/8 text-status-critical" : "bg-muted"}`}>
        <span className="font-semibold">Güfi keeps {companyBps / 100}%</span>
        <span className="tabular font-semibold">{money(BigInt(contractCents) - assignedCents)}</span>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-status-critical">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || problems.length > 0 || !dirty}
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save split"}
        </button>
        {status && (
          <span role="status" className={`text-sm font-medium ${status.ok ? "text-status-good" : "text-status-critical"}`}>
            {status.text}
          </span>
        )}
        {dirty && !status && <span className="text-xs font-semibold text-status-warning">Unsaved changes</span>}
      </div>
    </div>
  );
}
