import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { ProposalDocument } from "@/features/proposals/document";
import { getProposal, toDocument } from "@/features/proposals/queries";
import { PrintButton } from "@/features/proposals/small";

export const metadata: Metadata = { title: "Proposal preview" };

export default async function ProposalPreviewPage({ params }: PageProps<"/proposals/[id]/preview">) {
  const ws = await requirePermission("pipeline:read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const b = await getProposal(ws.organization.id, id);
  if (!b) notFound();
  const doc = toDocument(b, ws.organization.name);
  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-10 lg:-mt-9">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <Link href={`/proposals/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-link">
          <ChevronLeft aria-hidden className="size-4" /> Back to the proposal
        </Link>
        <span className="text-xs text-muted-foreground">{b.latest.locked_at ? "This is what the client sees." : "Draft preview. Save in the editor to see changes."}</span>
        <PrintButton />
      </div>
      <div className="bg-muted py-8 print:bg-card print:py-0">
        <div className="mx-auto max-w-[820px] shadow-pop print:shadow-none">
          <ProposalDocument doc={doc} />
        </div>
      </div>
    </div>
  );
}
