import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

// First lock (optimistic): refresh the session and send signed-out people to /sign-in.
// The real authorization is (1) requireWorkspace()/requirePermission() on every page and
// action and (2) RLS in the database.
const PUBLIC_PREFIXES = ["/sign-in", "/auth", "/setup"];
const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = supabaseConfig();

  // Not connected to Supabase yet: explain how to finish setup instead of crashing.
  if (!config) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  if (pathname === "/setup") return NextResponse.redirect(new URL("/", request.url));

  const { response, userId } = await updateSession(request, config);
  if (userId || matches(pathname, PUBLIC_PREFIXES)) return response;

  const signIn = new URL("/sign-in", request.url);
  if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`);
  const redirect = NextResponse.redirect(signIn);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
