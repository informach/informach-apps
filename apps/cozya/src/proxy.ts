import { createAuthProxy } from "@informach/auth/proxy";
import { authResult } from "./lib/auth";

export const proxy = createAuthProxy(authResult, {
  publicPaths: ["/sign-in", "/sign-up", "/verify-email", "/reset-password", "/api/auth"],
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};

export default proxy;
