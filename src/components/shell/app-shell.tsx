import type { Workspace } from "@/lib/auth";
import { HomeLogo } from "@/components/brand/logo";
import { AiPanel } from "@/components/ai/ai-panel";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { OrgSwitcher } from "./org-switcher";
import { UserBlock } from "./user-block";

export function AppShell({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  const footer = <UserBlock name={workspace.profile.full_name} email={workspace.profile.email} role={workspace.role} />;
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 pb-4 pt-6">
          <HomeLogo />
          <div className="mt-3">
            <OrgSwitcher current={workspace.organization} organizations={workspace.organizations} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks role={workspace.role} />
        </div>
        <div className="border-t border-border p-3">{footer}</div>
      </aside>

      <MobileNav role={workspace.role} logo={<HomeLogo />} footer={footer} />

      <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>

      <AiPanel />
    </div>
  );
}
