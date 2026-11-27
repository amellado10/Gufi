import Link from "next/link";

// The official Güfi wordmark (cropped from gufi.io's logo, geometry untouched), drawn as a
// mask so it takes the brand pink. `tone="white"` is for pink surfaces.
export function Wordmark({ className = "", tone = "pink" }: { className?: string; tone?: "pink" | "white" }) {
  return (
    <span
      role="img"
      aria-label="Güfi"
      className={`gufi-wordmark inline-block ${className}`}
      style={tone === "white" ? ({ "--wordmark-color": "#ffffff" } as React.CSSProperties) : undefined}
    />
  );
}

export function HomeLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Güfi OS home" className={`inline-flex ${className}`}>
      <Wordmark className="h-7" />
    </Link>
  );
}
