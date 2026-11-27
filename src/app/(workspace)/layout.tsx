import { requireWorkspace } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

// Second lock behind src/proxy.ts. Pages and actions check again (layouts don't re-run on
// client navigation), and RLS is the final word in the database.
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const workspace = await requireWorkspace();
  return <AppShell workspace={workspace}>{children}</AppShell>;
}
