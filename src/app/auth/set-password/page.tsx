import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/logo";
import { getUser } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark className="h-10" />
        </div>
        <div className="gufi-corner border border-border bg-card p-6 shadow-pop sm:p-8">
          <h1 className="text-xl font-bold">Choose a password</h1>
          <p className="mt-1 text-sm text-muted-foreground">For {user.email}. Use at least 12 characters.</p>
          <SetPasswordForm />
        </div>
      </div>
    </main>
  );
}
