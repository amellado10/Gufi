import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay, formatMoment, todayIn } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { proposalNumber, STATUS_META } from "@/features/proposals/model";
import { listProposals } from "@/features/proposals/queries";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Proposals" };

export default async function ProposalsPage() {
  const ws = await requirePermission("pipeline:read");
  const proposals = await listProposals(ws.organization.id);
  const today = todayIn(ws.organization.timezone);
  const canWrite = can(ws.role, "pipeline:write");
  return (
    <>
      <PageHeader
        title="Proposals"
        description="Branded proposals with a secure client link. Accepting one creates the project and its finances."
        actions={
          canWrite && (
            <ButtonLink href="/proposals/new">
              <Plus aria-hidden className="size-4" /> New proposal
            </ButtonLink>
          )
        }
      />
      <Card padded={false}>
        {proposals.length === 0 ? (
          <EmptyState icon={FileText} title="No proposals yet" action={canWrite ? <ButtonLink href="/proposals/new">Write the first one</ButtonLink> : null}>
            Start from a deal in the pipeline so sending and acceptance move it automatically.
          </EmptyState>
        ) : (
          <Table label="Proposals">
            <thead>
              <tr>
                <Th>Proposal</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => {
                const s = STATUS_META[p.status];
                return (
                  <tr key={p.id} className="hover:bg-muted/60">
                    <Td>
                      <Link href={`/proposals/${p.id}`} className="font-semibold hover:text-link hover:underline">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {proposalNumber(p.number)} · {p.client?.name}
                        {p.latest && p.latest.version > 1 ? ` · v${p.latest.version}` : ""}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </Td>
                    <Td className="tabular text-right">{p.totals ? formatMoney({ cents: p.totals.total, currency: ws.organization.default_currency }) : "—"}</Td>
                    <Td className="tabular text-muted-foreground">{formatDay(p.latest?.valid_until, today)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{formatMoment(p.updated_at, ws.organization.timezone)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
