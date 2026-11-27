import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX, Eye, FolderKanban, GitBranch, Link2, Target } from "lucide-react";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatMoment, todayIn } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { siteUrl } from "@/lib/env";
import { createLinkAction, newRevisionAction, revokeLinkAction } from "@/features/proposals/actions";
import { ProposalEditor } from "@/features/proposals/editor";
import { proposalNumber, SECTION_KEYS, STATUS_META } from "@/features/proposals/model";
import { getProposal, sectionsOf } from "@/features/proposals/queries";
import { CopyLink } from "@/features/proposals/small";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: PageProps<"/proposals/[id]">) {
  const ws = await requirePermission("pipeline:read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const b = await getProposal(ws.organization.id, id);
  if (!b) notFound();

  const { proposal, latest } = b;
  const canWrite = can(ws.role, "pipeline:write");
  const status = STATUS_META[latest.status];
  const isDraft = !latest.locked_at;
  const tz = ws.organization.timezone;
  const activeLink = b.links.find((l) => l.version_id === latest.id && !l.revoked_at);
  const response = b.responses.find((r) => r.version_id === latest.id);
  const fmt = (c: number | null) => (c === null ? "—" : formatMoney({ cents: c, currency: latest.currency }));

  return (
    <>
      <PageHeader
        back={{ href: "/proposals", label: "Proposals" }}
        eyebrow={`${proposalNumber(proposal.number)} · ${proposal.client?.name ?? ""}`}
        title={proposal.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span>
              Version {latest.version}
              {b.versions.length > 1 ? ` of ${b.versions.length}` : ""}
            </span>
            {proposal.opportunity && (
              <Link href={`/pipeline/${proposal.opportunity.id}`} className="inline-flex items-center gap-1 hover:text-link hover:underline">
                <Target aria-hidden className="size-3.5" /> {proposal.opportunity.title}
              </Link>
            )}
            {proposal.project_id && (
              <Link href={`/projects/${proposal.project_id}`} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                <FolderKanban aria-hidden className="size-3.5" /> Project
              </Link>
            )}
          </span>
        }
        actions={
          !isDraft && (
            <ButtonLink href={`/proposals/${id}/preview`} variant="secondary">
              <Eye aria-hidden className="size-4" /> View document
            </ButtonLink>
          )
        }
      />

      {isDraft && canWrite ? (
        <ProposalEditor
          proposalId={id}
          versionId={latest.id}
          today={todayIn(tz)}
          currency={latest.currency}
          initial={{
            title: proposal.title,
            language: proposal.language,
            tax_rate_bps: latest.tax_rate_bps,
            valid_until: latest.valid_until ?? "",
            sections: Object.fromEntries(sectionsOf(latest.content).map((s) => [s.key, s.body])) as Record<(typeof SECTION_KEYS)[number], string>,
            items: b.items.map((i) => ({
              name: i.name,
              description: i.description ?? "",
              quantity: String(i.quantity_hundredths / 100),
              unit_price: (Number(i.unit_price_cents) / 100).toFixed(2),
              optional: i.optional,
            })),
            milestones: b.milestones.map((m) => ({ label: m.label, percent: String(m.percent_bps / 100), due: m.due ?? "" })),
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {response ? (
              <Card title={response.decision === "accepted" ? "Accepted" : "Declined"}>
                <div className="flex gap-3 text-sm">
                  {response.decision === "accepted" ? (
                    <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-status-good" />
                  ) : (
                    <CircleX aria-hidden className="mt-0.5 size-5 shrink-0 text-status-critical" />
                  )}
                  <div className="space-y-1">
                    <p>
                      <strong>{response.signer_name}</strong>
                      {response.signer_title ? `, ${response.signer_title}` : ""} ({response.signer_email}) · {formatMoment(response.responded_at, tz)}
                    </p>
                    {response.decision === "accepted" ? (
                      <p className="tabular">
                        Accepted total {fmt(response.total_cents)} (subtotal {fmt(response.subtotal_cents)} + ITBMS {fmt(response.tax_cents)})
                        {response.selected_optional_item_ids.length ? `, with ${response.selected_optional_item_ids.length} optional add-on(s)` : ""}.
                      </p>
                    ) : (
                      response.decline_reason && <p>Reason: {response.decline_reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Fingerprint of the accepted version: <code className="break-all">{response.content_hash.slice(0, 16)}…</code>
                    </p>
                    {proposal.project_id && (
                      <Link href={`/projects/${proposal.project_id}`} className="inline-flex items-center gap-1.5 pt-1 font-semibold text-link hover:underline">
                        <FolderKanban aria-hidden className="size-4" /> Open the project (finances already filled in)
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="Client link" description="Anyone with this link can view and respond. Revoke it to stop access.">
                {activeLink ? (
                  <div className="space-y-3">
                    <CopyLink url={`${siteUrl()}/p/${activeLink.token}`} />
                    {canWrite && (
                      <form action={revokeLinkAction.bind(null, id, activeLink.id)}>
                        <button type="submit" className="text-sm font-medium text-status-critical hover:underline">
                          Revoke this link
                        </button>
                      </form>
                    )}
                  </div>
                ) : ["sent", "viewed"].includes(latest.status) && canWrite ? (
                  <form action={createLinkAction.bind(null, id, latest.id)}>
                    <Button type="submit" variant="secondary">
                      <Link2 aria-hidden className="size-4" /> Create a new link
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">No active link.</p>
                )}
              </Card>
            )}

            {canWrite && latest.status !== "accepted" && (
              <Card title="Need changes?">
                <form action={newRevisionAction.bind(null, id)} className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">Start version {latest.version + 1} from this one. When you send it, this version&apos;s link stops working.</p>
                  <Button type="submit" variant="secondary">
                    <GitBranch aria-hidden className="size-4" /> New revision
                  </Button>
                </form>
              </Card>
            )}
          </div>

          <Card title="History" padded={false}>
            <ol className="divide-y divide-border text-sm">
              {b.versions.map((v) => {
                const r = b.responses.find((x) => x.version_id === v.id);
                const s = STATUS_META[v.status];
                return (
                  <li key={v.id} className="space-y-1 px-5 py-3">
                    <p className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Version {v.version}</span>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      <li>Created {formatMoment(v.created_at, tz)}</li>
                      {v.sent_at && <li>Sent {formatMoment(v.sent_at, tz)}</li>}
                      {v.first_viewed_at && <li>First viewed {formatMoment(v.first_viewed_at, tz)}</li>}
                      {r && (
                        <li>
                          {r.decision === "accepted" ? "Accepted" : "Declined"} by {r.signer_name}, {formatMoment(r.responded_at, tz)}
                        </li>
                      )}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}
