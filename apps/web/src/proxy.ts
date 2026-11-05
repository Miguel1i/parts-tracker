import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { evaluateAccess } from "./lib/auth/access";
import { auth } from "./lib/auth/server";

const intl = createMiddleware(routing);

/** `/admin…` with or without a locale prefix (`/pt/admin…`). */
const ADMIN_PATH = /^(?:\/pt)?\/admin(?:\/|$)/;

/**
 * Admin gate before rendering. The admin layout also checks (and every action re-checks), but
 * with Cache Components the static shell is flushed with status 200 before the layout can call
 * notFound(). Rewriting non-admins to an unknown path here gives the same real 404 as any
 * other missing page, so the admin area's existence isn't revealed even by the status code.
 */
export default async function proxy(request: NextRequest) {
  if (ADMIN_PATH.test(request.nextUrl.pathname)) {
    const session = await auth.api
      .getSession({ headers: request.headers, query: { disableCookieCache: true } })
      .catch(() => null);
    if (evaluateAccess(session?.user, "admin") !== "ok") {
      const url = request.nextUrl.clone();
      url.pathname = request.nextUrl.pathname.replace(/\/admin(?:\/.*)?$/, "/not-found-404");
      return intl(new NextRequest(url, request)) ?? NextResponse.rewrite(url);
    }
  }
  return intl(request);
}

export const config = {
  // everything except API routes, Next internals and files with an extension
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
