"use client";

// Phone/tablet menu: ☰ opens a panel from the left, styled like the desktop sidebar.
// Closes on a link tap, outside tap, X or Escape; focus stays inside while open and returns
// to ☰ afterwards. (Pattern from Mosaico OS.)
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { Role } from "@/lib/roles";
import { NavLinks } from "./nav-links";

export function MobileNav({ role, logo, footer }: { role: Role; logo: React.ReactNode; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);

  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    p?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !p) return;
      const items = [...p.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")];
      const [first, last] = [items[0], items[items.length - 1]];
      const wrapTo = e.shiftKey && document.activeElement === first ? last : !e.shiftKey && document.activeElement === last ? first : null;
      if (wrapTo) {
        e.preventDefault();
        wrapTo.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-sidebar/95 px-4 py-2.5 backdrop-blur lg:hidden">
        {logo}
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls={panelId}
          className="-mr-2 flex size-11 items-center justify-center rounded-md hover:bg-sidebar-accent"
        >
          <Menu aria-hidden className="size-5" />
        </button>
      </header>

      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} inert={!open}>
        <div
          aria-hidden
          onClick={close}
          className={`absolute inset-0 bg-[#3d1426]/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-sidebar shadow-pop transition-transform duration-300 ease-gufi ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3">
            {logo}
            <button type="button" data-autofocus onClick={close} aria-label="Close menu" className="-mr-2 flex size-11 items-center justify-center rounded-md hover:bg-sidebar-accent">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <NavLinks role={role} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border p-3">{footer}</div>
        </div>
      </div>
    </>
  );
}
