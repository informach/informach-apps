import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureEnvironment } from "./browser-environment.mts";

test("isolated browser builds disable Sentry publishing without inheriting credentials", () => {
  const env = fixtureEnvironment("cozya", "http://localhost:3002", {
    COMPASSO_ISOLATED_DATABASE: "1",
    DATABASE_URL: "postgres://fixture:fixture@localhost:5432/fixture",
    BETTER_AUTH_SECRET: "isolated-fixture-secret-32-characters",
    SENTRY_BUILD_VERIFICATION: "untrusted-inherited-value",
    SENTRY_AUTH_TOKEN: "untrusted-inherited-token",
    SENTRY_DSN: "untrusted-inherited-dsn",
  });
  assert.equal(env.SENTRY_BUILD_VERIFICATION, "1");
  assert.equal(env.SENTRY_AUTH_TOKEN, "");
  assert.equal(env.SENTRY_DSN, "");
});
