"use client";

// Güfi AI: the contextual assistant slot. The assistant is NOT connected in this phase, and this
// panel says so plainly: no input that pretends to work (AGENTS.md §4, §6).
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

const CAPABILITIES = [
  ["Sales", "Pipeline analysis, follow-ups and upsell ideas"],
  ["Proposals", "Scope, estimates and branded proposal drafts"],
  ["Delivery", "Work breakdown, project risks and priorities"],
  ["Finance", "Read-only analysis, variance and cash forecasts"],
  ["Shopify", "Official platform updates matched to client stores"],
  ["Marketing", "Performance analysis and campaign recommendations"],
] as const;

export function AiPanel() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-pop transition-transform hover:-translate-y-0.5"
      >
        <Sparkles aria-hidden className="size-4" />
        Güfi AI
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="ai-title"
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        className="m-0 ml-auto h-dvh max-h-none w-[min(26rem,100vw)] max-w-none border-l border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-[#3d1426]/25"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="ai-title" className="flex items-center gap-2 text-base font-bold">
              <Sparkles aria-hidden className="size-4 text-brand" />
              Güfi AI
            </h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Güfi AI" className="flex size-9 items-center justify-center rounded-md hover:bg-accent">
              <X aria-hidden className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="gufi-corner bg-pink-100 p-4">
              <p className="text-sm font-semibold">Not connected yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The assistant arrives once its data and permission checks are built. It will only use data you&apos;re allowed to see, and it will
                ask before doing anything consequential.
              </p>
            </div>
            <h3 className="eyebrow mb-2 mt-6">Planned capabilities</h3>
            <ul className="space-y-3">
              {CAPABILITIES.map(([name, text]) => (
                <li key={name} className="text-sm">
                  <span className="font-semibold">{name}</span>
                  <span className="text-muted-foreground"> · {text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
