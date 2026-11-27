"use client";

// Stage buttons on a deal page. Moving to a "lost" stage asks for the reason first.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveDealAction } from "./actions";

export function StageSwitcher({ dealId, current, stages }: { dealId: string; current: string; stages: { id: string; name: string; kind: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [askLost, setAskLost] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (askLost && !d.open) d.showModal();
    if (!askLost && d.open) d.close();
  }, [askLost]);

  const move = (stageId: string, reason?: string) => {
    setError(null);
    startTransition(async () => {
      const res = await moveDealAction(dealId, stageId, reason);
      if (res.ok) router.refresh();
      else if (res.needsReason) setAskLost(stageId);
      else setError(res.message);
    });
  };

  return (
    <div>
      <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        {stages.map((s) => {
          const isCurrent = s.id === current;
          return (
            <button
              key={s.id}
              type="button"
              disabled={isCurrent || pending}
              aria-pressed={isCurrent}
              onClick={() => (s.kind === "lost" ? setAskLost(s.id) : move(s.id))}
              className="h-9 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-accent aria-pressed:border-brand aria-pressed:bg-pink-100 aria-pressed:font-semibold"
            >
              {isCurrent ? "✓ " : ""}
              {s.name}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-critical">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="lost-reason-title"
        onClose={() => setAskLost(null)}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-[#3d1426]/25"
      >
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
            if (!reason || !askLost) return;
            const stageId = askLost;
            setAskLost(null);
            move(stageId, reason);
          }}
        >
          <h2 id="lost-reason-title" className="text-base font-bold">
            Why was this deal lost?
          </h2>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] font-semibold">Reason (required)</span>
            <textarea name="reason" required rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" placeholder="Budget, timing, chose another agency…" />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setAskLost(null)} className="h-10 rounded-md px-4 text-sm font-semibold hover:bg-accent">
              Cancel
            </button>
            <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              Mark as lost
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
