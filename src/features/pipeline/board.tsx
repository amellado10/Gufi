"use client";

// Pipeline board: one column per stage, cards dragged by their handle (pointer or keyboard:
// focus the handle, Space to lift, arrows to move, Space to drop). Moves are optimistic and
// roll back if the server refuses. Dropping on a "lost" stage asks for the reason first.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, GripVertical, TriangleExclamationPoint } from "lucide-react";
import { moveDealAction } from "./actions";
import type { FollowUpState } from "./model";

export type BoardStage = { id: string; name: string; kind: "open" | "won" | "lost" };
export type BoardDeal = {
  id: string;
  title: string;
  stageId: string;
  valueCents: number | null;
  clientName: string;
  ownerName: string | null;
  followUp: string | null; // formatted
  followUpState: FollowUpState;
};

const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

function FollowUp({ deal }: { deal: BoardDeal }) {
  if (!deal.followUp) return null;
  const overdue = deal.followUpState === "overdue";
  const today = deal.followUpState === "today";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${overdue ? "font-semibold text-status-critical" : today ? "font-semibold text-status-warning" : "text-muted-foreground"}`}>
      {overdue ? <TriangleExclamationPoint aria-hidden className="size-3.5" /> : <CalendarClock aria-hidden className="size-3.5" />}
      {overdue ? "Follow-up overdue · " : today ? "Follow up today · " : "Follow up "}
      {deal.followUp}
    </span>
  );
}

function CardBody({ deal, handle }: { deal: BoardDeal; handle?: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {handle}
      <div className="min-w-0 flex-1">
        <Link href={`/pipeline/${deal.id}`} className="block truncate text-sm font-semibold hover:text-link hover:underline">
          {deal.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{deal.clientName}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="tabular text-sm font-semibold">{deal.valueCents !== null ? fmt(deal.valueCents) : "—"}</span>
          {deal.ownerName && <span className="truncate text-xs text-muted-foreground">{deal.ownerName}</span>}
        </div>
        <div className="mt-1">
          <FollowUp deal={deal} />
        </div>
      </div>
    </div>
  );
}

function DealCard({ deal, canMove, stageName }: { deal: BoardDeal; canMove: boolean; stageName: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: !canMove });
  return (
    <li ref={setNodeRef} className={`rounded-md border border-border bg-card p-3 shadow-card ${isDragging ? "opacity-40" : ""}`}>
      <CardBody
        deal={deal}
        handle={
          canMove ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              aria-label={`Move ${deal.title} (now in ${stageName})`}
              className="-ml-1 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          ) : undefined
        }
      />
    </li>
  );
}

function Column({ stage, deals, canMove }: { stage: BoardStage; deals: BoardDeal[]; canMove: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((a, d) => a + (d.valueCents ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name}: ${deals.length} deal${deals.length === 1 ? "" : "s"}`}
      className={`flex w-[272px] shrink-0 flex-col rounded-lg border p-2 transition-colors ${isOver ? "border-brand bg-pink-100" : "border-border bg-muted"}`}
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2 pt-1">
        <h2 className="text-[13px] font-bold">
          {stage.name} <span className="font-normal text-muted-foreground">{deals.length}</span>
        </h2>
        <span className="tabular text-xs font-semibold text-muted-foreground">{total ? fmt(total) : ""}</span>
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} canMove={canMove} stageName={stage.name} />
        ))}
        {deals.length === 0 && <li className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-xs text-muted-foreground">No deals</li>}
      </ul>
    </section>
  );
}

export function PipelineBoard({ stages, deals, canMove }: { stages: BoardStage[]; deals: BoardDeal[]; canMove: boolean }) {
  const [items, setItems] = useState(deals);
  const [synced, setSynced] = useState(deals);
  if (synced !== deals) {
    // New data from the server (after a move or navigation) replaces the local copy.
    setSynced(deals);
    setItems(deals);
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{ dealId: string; stageId: string; from: string } | null>(null);
  const [, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const titleOf = (id: string | number) => items.find((d) => d.id === id)?.title ?? "deal";

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (pendingLost && !d.open) d.showModal();
    if (!pendingLost && d.open) d.close();
  }, [pendingLost]);

  const move = (dealId: string, stageId: string, from: string, reason?: string) => {
    setError(null);
    setItems((cur) => cur.map((d) => (d.id === dealId ? { ...d, stageId } : d)));
    startTransition(async () => {
      const res = await moveDealAction(dealId, stageId, reason);
      if (!res.ok) {
        setItems((cur) => cur.map((d) => (d.id === dealId ? { ...d, stageId: from } : d)));
        setError(res.message);
      }
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const deal = items.find((d) => d.id === e.active.id);
    const to = e.over?.id as string | undefined;
    if (!deal || !to || to === deal.stageId) return;
    if (stages.find((s) => s.id === to)?.kind === "lost") {
      setPendingLost({ dealId: deal.id, stageId: to, from: deal.stageId });
      return;
    }
    move(deal.id, to, deal.stageId);
  };

  const active = items.find((d) => d.id === activeId) ?? null;

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-status-critical/20 bg-status-critical/8 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}
      <DndContext
        id="pipeline-board"
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${stageName.get(String(over.id))}.` : `${titleOf(active.id)} is not over a stage.`),
            onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped in ${stageName.get(String(over.id))}.` : `${titleOf(active.id)} dropped.`),
            onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
          },
          screenReaderInstructions: { draggable: "To move a deal, press Space, use the arrow keys to reach a stage, then press Space again. Escape cancels." },
        }}
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex gap-3">
            {stages.map((s) => (
              <Column key={s.id} stage={s} deals={items.filter((d) => d.stageId === s.id)} canMove={canMove} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active ? (
            <div className="w-[256px] rotate-1 rounded-md border border-brand bg-card p-3 shadow-pop">
              <CardBody deal={active} handle={<span className="flex h-7 w-5 items-center justify-center text-muted-foreground"><GripVertical aria-hidden className="size-4" /></span>} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <dialog
        ref={dialog}
        aria-labelledby="lost-title"
        onClose={() => setPendingLost(null)}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-[#3d1426]/25"
      >
        <form
          method="dialog"
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
            if (!reason || !pendingLost) return;
            move(pendingLost.dealId, pendingLost.stageId, pendingLost.from, reason);
            setPendingLost(null);
          }}
        >
          <h2 id="lost-title" className="text-base font-bold">
            Why was {pendingLost ? titleOf(pendingLost.dealId) : "this deal"} lost?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">It goes on the deal&apos;s timeline and helps spot patterns.</p>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] font-semibold">Reason (required)</span>
            <textarea name="reason" required rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" placeholder="Budget, timing, chose another agency…" />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPendingLost(null)} className="h-10 rounded-md px-4 text-sm font-semibold hover:bg-accent">
              Cancel
            </button>
            <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              Mark as lost
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
