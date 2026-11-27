export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading…</span>
      <div className="mb-8 h-8 w-56 rounded-md bg-pink-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-lg border border-border bg-card" />
    </div>
  );
}
