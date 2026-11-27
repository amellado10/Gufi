"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

import { buttonClass, type ButtonSize as Size, type ButtonVariant as Variant } from "./button-styles";

export { buttonClass };

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
