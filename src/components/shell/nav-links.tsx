"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building,
  Calendar,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Settings,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

type Item = { href: string; label: string; icon: LucideIcon; roles?: Role[] };

// Live modules. `roles` limits who sees the link (the page and the database check again).
const NAV: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Building },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/finance", label: "Finance", icon: Wallet, roles: ["admin", "finance"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

// On the roadmap (AGENTS.md §9). Shown as plain text with a "Planned" tag: never as links.
const PLANNED: Item[] = [
  { href: "#proposals", label: "Proposals", icon: FileText, roles: ["admin", "project_manager", "marketing"] },
  { href: "#tasks", label: "Tasks", icon: ListTodo },
  { href: "#calendar", label: "Calendar", icon: Calendar },
  { href: "#marketing", label: "Marketing", icon: Megaphone, roles: ["admin", "marketing"] },
  { href: "#shopify", label: "Shopify intelligence", icon: ShoppingBag, roles: ["admin", "project_manager", "team"] },
];

const visible = (items: Item[], role: Role) => items.filter((i) => !i.roles || i.roles.includes(role));

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-0.5">
        {visible(NAV, role).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-card text-foreground shadow-card" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand" />}
                <Icon aria-hidden className={`size-4 ${active ? "text-brand" : "text-muted-foreground group-hover:text-foreground"}`} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="eyebrow mb-1.5 px-2.5">Coming next</p>
        <ul className="flex flex-col gap-0.5">
          {visible(PLANNED, role).map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex h-8 items-center gap-2.5 px-2.5 text-[13px] text-muted-foreground">
              <Icon aria-hidden className="size-4 opacity-70" />
              <span className="flex-1">{label}</span>
              <span className="rounded border border-border px-1.5 text-[10px] font-semibold">Planned</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
