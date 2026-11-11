import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

const base: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3009",
  NEXT_PUBLIC_APP_URL: "http://localhost:3009",
  SENDGRID_API_KEY: "SG.test",
  SENDGRID_FROM: "test@example.test",
  EMAIL_SANDBOX_MODE: "memory",
};
const production: NodeJS.ProcessEnv = {
  ...base,
  BETTER_AUTH_URL: "https://recreio.example.test",
  NEXT_PUBLIC_APP_URL: "https://recreio.example.test",
  EMAIL_SANDBOX_MODE: "live",
  REDIS_URL: "redis://localhost:6379",
  SENTRY_DSN: "https://key@example.test/1",
  NEXT_PUBLIC_SENTRY_DSN: "https://key@example.test/1",
};
describe("deployment environment", () => {
  it("allows local production builds without Redis, Sentry or live email", () => {
    expect(validateEnvironment(base).EMAIL_SANDBOX_MODE).toBe("memory");
  });
  it("accepts complete production dependencies", () => {
    expect(validateEnvironment(production).NEXT_PUBLIC_APP_URL).toBe(
      "https://recreio.example.test",
    );
  });
  it.each([
    { EMAIL_SANDBOX_MODE: "sandbox" },
    { REDIS_URL: undefined },
    { SENTRY_DSN: undefined },
    { NEXT_PUBLIC_SENTRY_DSN: undefined },
    { NEXT_PUBLIC_SENTRY_DSN: "https://other@example.test/2" },
    { RECREIO_ISOLATED_TEST: "1" },
    { BETTER_AUTH_URL: "https://different.example.test" },
    {
      BETTER_AUTH_URL: "http://recreio.example.test",
      NEXT_PUBLIC_APP_URL: "http://recreio.example.test",
    },
    { NEXT_PUBLIC_APP_URL: "https://recreio.example.test/" },
  ])("rejects incomplete or mixed production configuration (%j)", (override) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow();
  });
  it("rejects localhost deployment even if an isolated-test flag is set", () => {
    expect(() =>
      validateEnvironment({
        ...base,
        RAILWAY_ENVIRONMENT_ID: "production",
        RECREIO_ISOLATED_TEST: "1",
      }),
    ).toThrow();
  });
  it("treats a Railway deployment as production whatever NODE_ENV says", () => {
    expect(() =>
      validateEnvironment({
        ...production,
        NODE_ENV: "development",
        RAILWAY_ENVIRONMENT_ID: "production",
        REDIS_URL: undefined,
      }),
    ).toThrow("Redis");
  });
  it("closes the access by default and accepts only the two known modes", () => {
    expect(validateEnvironment(base).RECREIO_ACCESS_MODE).toBe("fechado");
    expect(
      validateEnvironment({ ...base, RECREIO_ACCESS_MODE: "aberto" }).RECREIO_ACCESS_MODE,
    ).toBe("aberto");
    expect(() => validateEnvironment({ ...base, RECREIO_ACCESS_MODE: "publico" })).toThrow(
      "RECREIO_ACCESS_MODE",
    );
  });
  it("never includes rejected credentials in validation errors", () => {
    expect(() => validateEnvironment({ ...base, BETTER_AUTH_SECRET: "sensitive-value" })).toThrow(
      "BETTER_AUTH_SECRET",
    );
    try {
      validateEnvironment({ ...base, BETTER_AUTH_SECRET: "sensitive-value" });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-value");
    }
  });
});
