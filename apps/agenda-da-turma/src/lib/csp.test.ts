import { afterEach, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
}));
vi.mock("./env", () => ({ env: settings }));

import { buildCspHeader } from "./csp";

afterEach(() => {
  settings.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
});
it("keeps nonce enforcement in optimized local builds without upgrading loopback to unavailable TLS", () => {
  const csp = buildCspHeader({ nonce: "synthetic-nonce", includeReporting: false });
  expect(csp).toContain("'nonce-synthetic-nonce' 'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).not.toContain("upgrade-insecure-requests");
});
it("continues upgrading insecure subresources on the HTTPS deployment", () => {
  settings.NEXT_PUBLIC_APP_URL = "https://agenda-da-turma.informach.com.br";
  expect(buildCspHeader({ nonce: "synthetic-nonce", includeReporting: false })).toContain(
    "upgrade-insecure-requests",
  );
});
