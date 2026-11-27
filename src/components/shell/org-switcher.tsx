import { ChevronsUpDown } from "lucide-react";
import { switchOrganization } from "@/app/(workspace)/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";

// Most people belong to one organization: then this is just a label.
export function OrgSwitcher({ current, organizations }: { current: { id: string; name: string }; organizations: { id: string; name: string; role: Role }[] }) {
  if (organizations.length < 2) {
    return <p className="truncate text-[13px] font-semibold text-muted-foreground">{current.name}</p>;
  }
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] font-semibold text-muted-foreground hover:bg-sidebar-accent [&::-webkit-details-marker]:hidden">
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown aria-hidden className="size-3.5" />
      </summary>
      <ul className="absolute inset-x-0 z-20 mt-1 rounded-md border border-border bg-popover p-1 shadow-pop">
        {organizations.map((o) => (
          <li key={o.id}>
            <form action={switchOrganization.bind(null, o.id)}>
              <button
                type="submit"
                aria-current={o.id === current.id ? "true" : undefined}
                className="w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent aria-[current=true]:font-semibold"
              >
                {o.name}
                <span className="block text-xs text-muted-foreground">{ROLE_LABELS[o.role]}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
