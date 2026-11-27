// Only allow redirects to paths inside this app ("/clients?x=1"), never to other sites.
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
