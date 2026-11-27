"use client";

import { TriangleExclamationPoint } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <span className="gufi-corner mx-auto mb-4 flex size-12 items-center justify-center bg-pink-100 text-status-critical">
        <TriangleExclamationPoint aria-hidden className="size-5" />
      </span>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page couldn&apos;t load. Your data is safe. Try again, and if it keeps happening share this reference with the team:{" "}
        <code className="rounded bg-pink-100 px-1">{error.digest ?? "n/a"}</code>
      </p>
      <Button className="mt-6" variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
