import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { initials } from "@/lib/format";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/roles";
import { OrganizationForm } from "@/features/settings/organization-form";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ws = await requirePermission("settings:manage");
  const roster = await getRoster(ws.organization.id);
  const timezones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

  return (
    <>
      <PageHeader title="Settings" description={`Workspace settings for ${ws.organization.name}.`} />
      <div className="space-y-6">
        <Card title="Workspace">
          <OrganizationForm defaults={ws.organization} timezones={timezones} />
        </Card>

        <Card
          title="Team"
          description="Invitations and role changes are done by an admin from the terminal for now (npm run invite). An in-app invite flow comes next."
          padded={false}
        >
          <Table label="Team members">
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Can see</Th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => (
                <tr key={m.user_id}>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="gufi-corner flex size-8 shrink-0 items-center justify-center bg-pink-100 text-[11px] font-bold">
                        {initials(m.full_name, m.email)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{memberLabel(m)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>{ROLE_LABELS[m.role]}</Td>
                  <Td className="max-w-sm text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[m.role]}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Roles" description="Enforced by the database (row-level security), not just hidden in the interface.">
          <dl className="grid gap-4 sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r} className="rounded-md border border-border p-4">
                <dt className="text-sm font-semibold">{ROLE_LABELS[r]}</dt>
                <dd className="mt-1 text-[13px] text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
