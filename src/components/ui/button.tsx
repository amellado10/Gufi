"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-60";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-card transition-colors",
  // The gufi.io button: white with a pink sweep on hover.
  secondary: "btn-sweep border border-border-strong bg-card text-foreground hover:-translate-y-px hover:shadow-card",
  ghost: "text-foreground hover:bg-accent transition-colors",
  danger: "border border-status-critical/30 bg-card text-status-critical hover:bg-status-critical/5 transition-colors",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

// Submit button that shows progress while its form's server action runs.
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass(variant, size, className)}>
      {pending && <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
