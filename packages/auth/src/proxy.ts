import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import type { Helpers } from "./helpers";
import { isRole, type Role, roleSatisfies } from "./permissions";

export type AuthProxyConfig = {
  /** Path prefixes that require authentication (e.g. ["/dashboard"]). */
  requireAuth?: string[];
  /** Path prefixes that require a specific role. */
  requireRole?: Array<{ prefix: string; role: Role }>;
  /** Paths that are always public, even when nested under `requireAuth`. */
  publicPaths?: string[];
  /** Redirect target when authentication fails. Defaults to `/sign-in`. */
  signInPath?: string;
  /** Query parameter used to store the post-login destination. Defaults to `next`. */
  nextParam?: string;
  /** Where to send authenticated-but-unauthorized users. Defaults to `/`. */
  forbiddenPath?: string;
};

export type AuthProxy = (request: NextRequest) => Promise<NextResponse>;

function pathMatches(prefixes: readonly string[], pathname: string): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function createAuthProxy<TUser, TSession>(
  helpers: Pick<Helpers<TUser, TSession>, "getCurrentUser">,
  config: AuthProxyConfig = {},
): AuthProxy {
  const requireAuth = config.requireAuth ?? [];
  const requireRole = config.requireRole ?? [];
  const publicPaths = config.publicPaths ?? [];
  const signInPath = config.signInPath ?? "/sign-in";
  const nextParam = config.nextParam ?? "next";
  const forbiddenPath = config.forbiddenPath ?? "/";

  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const pathname = request.nextUrl.pathname;

    if (pathMatches(publicPaths, pathname)) {
      return NextResponse.next();
    }

    const protectedByRole = requireRole.find((entry) => pathMatches([entry.prefix], pathname));
    const needsAuth = protectedByRole !== undefined || pathMatches(requireAuth, pathname);

    if (!needsAuth) {
      return NextResponse.next();
    }

    const user = await helpers.getCurrentUser(request.headers);

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = signInPath;
      url.search = "";
      url.searchParams.set(nextParam, `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }

    if (protectedByRole) {
      const role = (user as { role?: unknown }).role;
      if (!isRole(role) || !roleSatisfies(role, protectedByRole.role)) {
        const url = request.nextUrl.clone();
        url.pathname = forbiddenPath;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    return NextResponse.next();
  };
}
