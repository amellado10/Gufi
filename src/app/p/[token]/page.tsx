// The client-facing proposal link. No login: the page reads the proposal through the
// get_shared_proposal database function with the token, which returns public fields only.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX, Clock } from "lucide-react";
import { getWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/features/proposals/document";
import { LABELS, proposalNumber, publicProposal } from "@/features/proposals/model";
import { RespondPanel } from "@/features/proposals/respond-panel";
import { PrintButton } from "@/features/proposals/small";

export const metadata: Metadata = { title: "Propuesta · Güfi", robots: { index: false, follow: false } };

export default async function SharedProposalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_proposal", { p_token: token });
  const parsed = publicProposal.safeParse(data);
  if (!data || !parsed.success) notFound();
  const doc = parsed.data;
  const L = LABELS[doc.language];

  // Count it as viewed only when the visitor isn't a Güfi team member.
  if (["sent", "viewed"].includes(doc.status) && !(await getWorkspace())) {
    await supabase.rpc("mark_shared_proposal_viewed", { p_token: token });
  }
  const expired = doc.status === "expired" || (doc.valid_until !== null && !doc.response && doc.valid_until < new Date().toISOString().slice(0, 10));
  const canRespond = ["sent", "viewed"].includes(doc.status) && !doc.response && !expired;

  return (
    <main className="flex-1 bg-muted pb-16 print:bg-card print:pb-0">
      <div className="no-print mx-auto flex max-w-[820px] items-center justify-between gap-3 px-4 py-4">
        <span className="text-xs font-semibold text-muted-foreground">
          {L.proposal} {proposalNumber(doc.number)}
        </span>
        <PrintButton label={L.download} />
      </div>

      {doc.response && (
        <div
          role="status"
          className={`no-print mx-auto mb-4 flex max-w-[820px] items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${doc.response.decision === "accepted" ? "bg-status-good/10 text-status-good" : "bg-card text-foreground"}`}
        >
          {doc.response.decision === "accepted" ? <CircleCheck aria-hidden className="size-5" /> : <CircleX aria-hidden className="size-5" />}
          {doc.response.decision === "accepted" ? `${L.accepted} · ${L.acceptedBy} ${doc.response.signer_name}. ${L.thanks}` : `${L.declined} · ${L.declinedBy} ${doc.response.signer_name}`}
        </div>
      )}
      {!doc.response && (expired || doc.status === "superseded") && (
        <div role="status" className="no-print mx-auto mb-4 flex max-w-[820px] items-center gap-2 rounded-lg bg-card px-4 py-3 text-sm font-semibold">
          <Clock aria-hidden className="size-5 text-status-warning" />
          {doc.status === "superseded" ? L.superseded : L.expired}
        </div>
      )}

      <div className="mx-auto max-w-[820px] shadow-pop print:shadow-none">
        <ProposalDocument doc={doc} />
      </div>
      {canRespond && <RespondPanel token={token} doc={doc} />}
    </main>
  );
}
