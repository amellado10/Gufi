import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
import Link from "next/link";

export const metadata: Metadata = { title: "No access" };

// Outside (workspace)/ so it can't redirect to itself.
export default async function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  const { reason } = await searchParams;
  const permission = reason === "permission";
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-12 text-center">
      <Wordmark className="h-10" />
      <div className="max-w-md">
        <h1 className="text-xl font-bold">{permission ? "You don't have access to that page" : "Your account isn't in a workspace yet"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {permission
            ? "Your role doesn't include this area. Ask a Güfi admin if you need it."
            : "You're signed in, but no one has added you to a Güfi workspace. Ask a Güfi admin to invite you."}
        </p>
      </div>
      <div className="flex gap-2">
        {permission && (
          <Link href="/" className={buttonClass("secondary")}>
            Back to overview
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className={buttonClass(permission ? "ghost" : "secondary")}>
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
