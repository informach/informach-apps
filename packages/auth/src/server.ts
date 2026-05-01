import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Helpers } from "./helpers";

export type ServerHelpersConfig = {
  /** Path of the sign-in page; defaults to `/sign-in`. */
  signInPath?: string;
  /** Query parameter used to store the post-login destination. Defaults to `next`. */
  nextParam?: string;
};

export type ServerHelpers<TUser, TSession> = {
  getServerSession: () => Promise<{ user: TUser; session: TSession } | null>;
  getCurrentUserServer: () => Promise<TUser | null>;
  requireUserServer: () => Promise<TUser>;
  redirectIfUnauthenticated: (next?: string) => Promise<TUser>;
};

export function createServerHelpers<TUser, TSession>(
  helpers: Helpers<TUser, TSession>,
  config: ServerHelpersConfig = {},
): ServerHelpers<TUser, TSession> {
  const signInPath = config.signInPath ?? "/sign-in";
  const nextParam = config.nextParam ?? "next";

  async function getRequestHeaders() {
    const value = await headers();
    return value as unknown as Headers;
  }

  return {
    async getServerSession() {
      return helpers.getSession(await getRequestHeaders());
    },
    async getCurrentUserServer() {
      return helpers.getCurrentUser(await getRequestHeaders());
    },
    async requireUserServer() {
      return helpers.requireUser(await getRequestHeaders());
    },
    async redirectIfUnauthenticated(next?: string) {
      const user = await helpers.getCurrentUser(await getRequestHeaders());
      if (!user) {
        const target = next
          ? `${signInPath}?${nextParam}=${encodeURIComponent(next)}`
          : signInPath;
        redirect(target);
      }
      return user;
    },
  };
}
