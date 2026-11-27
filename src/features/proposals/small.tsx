"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted px-2.5 text-[13px]" />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-card px-3 text-sm font-semibold hover:bg-accent">
      <Printer aria-hidden className="size-4" /> {label}
    </button>
  );
}
