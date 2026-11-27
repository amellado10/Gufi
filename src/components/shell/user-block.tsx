import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { initials } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export function UserBlock({ name, email, role }: { name: string | null; email: string; role: Role }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="gufi-corner flex size-9 shrink-0 items-center justify-center bg-brand text-xs font-bold text-white">
        {initials(name, email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{name || email}</p>
        <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut aria-hidden className="size-4" />
        </button>
      </form>
    </div>
  );
}
