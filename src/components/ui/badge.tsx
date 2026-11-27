import type { LucideIcon } from "lucide-react";

export type Tone = "good" | "warning" | "critical" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  good: "text-status-good bg-status-good/8 border-status-good/20",
  warning: "text-status-warning bg-status-warning/8 border-status-warning/25",
  critical: "text-status-critical bg-status-critical/8 border-status-critical/20",
  info: "text-status-info bg-pink-50 border-pink-200",
  neutral: "text-status-neutral bg-muted border-border",
};

// Status is always an icon + a word, never color alone.
export function Badge({ tone = "neutral", icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

