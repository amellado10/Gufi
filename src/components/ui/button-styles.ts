// Button class names, shared by server and client components (no "use client" here, so server
// pages can call buttonClass() directly).
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-60";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-card transition-colors",
  // The gufi.io button: white with a pink sweep on hover.
  secondary: "btn-sweep border border-border-strong bg-card text-foreground hover:-translate-y-px hover:shadow-card",
  ghost: "text-foreground hover:bg-accent transition-colors",
  danger: "border border-status-critical/30 bg-card text-status-critical hover:bg-status-critical/5 transition-colors",
};
const sizes: Record<ButtonSize, string> = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm" };

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}
