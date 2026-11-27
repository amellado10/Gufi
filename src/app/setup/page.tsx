import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Finish setup" };

// Shown only while the Supabase environment variables are missing (see src/proxy.ts).
export default function SetupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <Wordmark className="mb-8 h-10" />
        <h1 className="text-2xl font-bold">Connect Güfi OS to Supabase</h1>
        <p className="mt-2 text-sm text-muted-foreground">The app is running, but it doesn&apos;t know which Supabase project to use yet.</p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm">
          <li>
            Copy <code className="rounded bg-pink-100 px-1">.env.example</code> to <code className="rounded bg-pink-100 px-1">.env.local</code>.
          </li>
          <li>
            Fill in <code className="rounded bg-pink-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-pink-100 px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> from Supabase → Project Settings → API.
          </li>
          <li>Restart the dev server. Full steps are in README → Setup.</li>
        </ol>
      </div>
    </main>
  );
}
