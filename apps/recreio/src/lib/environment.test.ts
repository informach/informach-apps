import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment";

/** Um par Ed25519 só deste teste, nos formatos que as variáveis esperam. */
function par() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privada: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publica: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
const chave = par();
const anterior = par();
const SEGREDO = "segredo-de-teste-com-pelo-menos-32-caracteres";

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
  RECREIO_TOKEN_PRIVATE_KEY: chave.privada,
  RECREIO_TOKEN_KEY_ID: "recreio-2026-11",
  CRON_SECRET: SEGREDO,
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
    { RECREIO_TOKEN_PRIVATE_KEY: undefined },
    { RECREIO_TOKEN_KEY_ID: undefined },
    { CRON_SECRET: undefined },
    { CRON_SECRET: "curto" },
    { RECREIO_GAME_ORIGINS: JSON.stringify({ morada: { ws: "ws://localhost:3010" } }) },
    { RECREIO_GAME_ORIGINS: JSON.stringify({ morada: { ws: "ws://morada.example.test" } }) },
    {
      RECREIO_GAME_ORIGINS: JSON.stringify({
        morada: { ws: "wss://morada.example.test", assets: "http://localhost:3012" },
      }),
    },
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
  it("keeps the test game off by default and accepts it in development", () => {
    expect(validateEnvironment(base).RECREIO_JOGO_DE_TESTE).toBe("0");
    expect(
      validateEnvironment({ ...base, NODE_ENV: "development", RECREIO_JOGO_DE_TESTE: "1" })
        .RECREIO_JOGO_DE_TESTE,
    ).toBe("1");
    expect(
      validateEnvironment({ ...base, NODE_ENV: "test", RECREIO_JOGO_DE_TESTE: "1" })
        .RECREIO_JOGO_DE_TESTE,
    ).toBe("1");
    expect(() => validateEnvironment({ ...base, RECREIO_JOGO_DE_TESTE: "sim" })).toThrow(
      "RECREIO_JOGO_DE_TESTE",
    );
  });
  it("refuses the test game when NODE_ENV is production", () => {
    // Build de produção em localhost, sem ser a verificação isolada.
    expect(() => validateEnvironment({ ...base, RECREIO_JOGO_DE_TESTE: "1" })).toThrow(
      "RECREIO_JOGO_DE_TESTE",
    );
    // Um serviço publicado completo.
    expect(() => validateEnvironment({ ...production, RECREIO_JOGO_DE_TESTE: "1" })).toThrow(
      "RECREIO_JOGO_DE_TESTE",
    );
    // A marca da verificação isolada não abre exceção num serviço publicado.
    expect(() =>
      validateEnvironment({
        ...production,
        RECREIO_JOGO_DE_TESTE: "1",
        RECREIO_ISOLATED_TEST: "1",
      }),
    ).toThrow();
  });
  it("refuses the test game on a Railway deployment whatever NODE_ENV says", () => {
    expect(() =>
      validateEnvironment({
        ...production,
        NODE_ENV: "development",
        RAILWAY_ENVIRONMENT_ID: "production",
        RECREIO_JOGO_DE_TESTE: "1",
      }),
    ).toThrow("RECREIO_JOGO_DE_TESTE");
  });
  it("accepts the test game in a production build only for the isolated verification on localhost", () => {
    expect(
      validateEnvironment({ ...base, RECREIO_JOGO_DE_TESTE: "1", RECREIO_ISOLATED_TEST: "1" })
        .RECREIO_JOGO_DE_TESTE,
    ).toBe("1");
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
  it("accepts the keys, secrets and origins of a production deployment", () => {
    const valor = validateEnvironment({
      ...production,
      // Como costuma chegar do provedor: numa linha, com a quebra escapada.
      RECREIO_TOKEN_PRIVATE_KEY: chave.privada.trim().split("\n").join("\\n"),
      RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: JSON.stringify({ "recreio-2026-05": anterior.publica }),
      RECREIO_HOST_SECRETS: JSON.stringify({ morada: SEGREDO }),
      RECREIO_GAME_ORIGINS: JSON.stringify({
        morada: { ws: "wss://morada.example.test", assets: "https://arte.example.test" },
      }),
    });
    expect(valor.RECREIO_HOST_SECRETS).toEqual({ morada: SEGREDO });
    expect(valor.RECREIO_GAME_ORIGINS.morada).toEqual({
      ws: "wss://morada.example.test",
      assets: "https://arte.example.test",
    });
    expect(Object.keys(valor.RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS)).toEqual(["recreio-2026-05"]);
  });
  it("outside production the token key is optional and local origins are allowed", () => {
    const valor = validateEnvironment({
      ...base,
      RECREIO_GAME_ORIGINS: JSON.stringify({
        morada: { ws: "ws://localhost:3010", assets: "http://127.0.0.1:3012" },
      }),
    });
    expect(valor.RECREIO_TOKEN_PRIVATE_KEY).toBeUndefined();
    expect(valor.RECREIO_HOST_SECRETS).toEqual({});
    expect(valor.RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS).toEqual({});
    expect(valor.RECREIO_GAME_ORIGINS.morada?.ws).toBe("ws://localhost:3010");
    // Fora de produção `ws:` só vale para a própria máquina.
    expect(() =>
      validateEnvironment({
        ...base,
        RECREIO_GAME_ORIGINS: JSON.stringify({ morada: { ws: "ws://morada.example.test" } }),
      }),
    ).toThrow("RECREIO_GAME_ORIGINS");
  });
  it.each([
    ["a public key in place of the private one", { RECREIO_TOKEN_PRIVATE_KEY: chave.publica }],
    ["text that is not a key", { RECREIO_TOKEN_PRIVATE_KEY: "nao-e-uma-chave" }],
    [
      "a private key of another algorithm",
      {
        RECREIO_TOKEN_PRIVATE_KEY: generateKeyPairSync("ec", { namedCurve: "P-256" })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
    ],
    ["a key without its id", { RECREIO_TOKEN_KEY_ID: undefined }],
    ["a key id with spaces", { RECREIO_TOKEN_KEY_ID: "chave nova" }],
    [
      "a previous key that is private",
      { RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: JSON.stringify({ antiga: anterior.privada }) },
    ],
    [
      "a previous key with the current id",
      {
        RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: JSON.stringify({ "recreio-2026-11": anterior.publica }),
      },
    ],
    ["previous keys that are not JSON", { RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: "{antiga:" }],
    ["a short host secret", { RECREIO_HOST_SECRETS: JSON.stringify({ morada: "curto" }) }],
    ["host secrets that are a list", { RECREIO_HOST_SECRETS: JSON.stringify([SEGREDO]) }],
    [
      "an origin with a path",
      { RECREIO_GAME_ORIGINS: JSON.stringify({ morada: { ws: "wss://morada.example.test/ws" } }) },
    ],
    [
      "an origin with the wrong scheme",
      { RECREIO_GAME_ORIGINS: JSON.stringify({ morada: { ws: "https://morada.example.test" } }) },
    ],
    [
      "an origin entry with an unknown field",
      {
        RECREIO_GAME_ORIGINS: JSON.stringify({
          morada: { ws: "wss://morada.example.test", http: "https://x.example.test" },
        }),
      },
    ],
    ["an origin without ws", { RECREIO_GAME_ORIGINS: JSON.stringify({ morada: {} }) }],
  ])("rejects %s, in any environment", (_caso, override) => {
    expect(() => validateEnvironment({ ...production, ...override })).toThrow();
    expect(() =>
      validateEnvironment({
        ...base,
        RECREIO_TOKEN_PRIVATE_KEY: chave.privada,
        RECREIO_TOKEN_KEY_ID: "recreio-2026-11",
        ...override,
      }),
    ).toThrow();
  });
  it("never repeats a rejected key or secret in the error", () => {
    for (const override of [
      { RECREIO_TOKEN_PRIVATE_KEY: chave.publica },
      { RECREIO_HOST_SECRETS: JSON.stringify({ morada: "segredo-curto" }) },
      { RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS: JSON.stringify({ antiga: anterior.privada }) },
    ]) {
      let mensagem = "";
      try {
        validateEnvironment({ ...production, ...override });
      } catch (error) {
        mensagem = String(error);
      }
      expect(mensagem).toMatch(/RECREIO_/);
      expect(mensagem).not.toContain("segredo-curto");
      expect(mensagem).not.toContain("BEGIN");
    }
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
