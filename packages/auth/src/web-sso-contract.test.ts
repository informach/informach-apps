import { describe, expect, it } from "vitest";
import {
  webAppDestination,
  webSsoClient,
  webSsoEnvironment,
  webSsoOrigin,
  webSsoReturnUrl,
} from "./web-sso-contract";

describe("registered web SSO destinations", () => {
  it("selects the deployment only from the exact configured registry origin", () => {
    expect(webSsoEnvironment("cozya", "http://localhost:3002")).toBe("development");
    expect(webSsoEnvironment("cozya", "https://cozya.informach.com.br")).toBe("production");
    for (const origin of [
      undefined,
      "http://localhost:3102",
      "http://127.0.0.1:3002",
      "https://cozya.informach.com.br/",
      "https://cozya.informach.com.br.evil.test",
      "https://agenda-da-turma.informach.com.br",
    ])
      expect(() => webSsoEnvironment("cozya", origin)).toThrow("registered");
  });
  it("keeps post-login destinations local and rejects browser-normalized redirects", () => {
    expect(webAppDestination("/familia/convite?codigo=abc#detalhes", "/inicio")).toBe(
      "/familia/convite?codigo=abc#detalhes",
    );
    for (const value of [
      undefined,
      null,
      ["/dashboard", "/api/auth"],
      { next: "/dashboard" },
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/api/auth/sign-out",
      "/login",
      "/entrar?next=/",
      "/signup",
      "/a/../api/secret",
      "/%61pi/secret",
      "/%2fevil.test",
      "/%5cevil.test",
      "/%255cevil.test",
      "/%00/x",
      "/%zz",
      "/a%2f..%2fapi/secret",
      `/${"x".repeat(2048)}`,
    ])
      expect(webAppDestination(value, "/inicio")).toBe("/inicio");
  });
  it("derives exact callbacks from the registry and excludes privileged/desktop issuers", () => {
    const client = webSsoClient("cozya", "production");
    expect(client.redirectUri).toBe(
      "https://cozya.informach.com.br/api/auth/callback/informach-cozya",
    );
    expect(
      webSsoReturnUrl(`${client.redirectUri}?code=one-use&state=browser-bound`, "production"),
    ).toContain("state=browser-bound");
    for (const app of ["admin", "edi", "unknown"])
      expect(() => webSsoOrigin(app, "production")).toThrow();
    expect(() => webSsoClient("conta", "production")).toThrow();
    for (const value of [
      "https://evil.example/api/auth/callback/informach-cozya?code=x&state=y",
      "https://cozya.informach.com.br.evil.example/api/auth/callback/informach-cozya?code=x&state=y",
      `${client.origin}/api/auth/callback/informach-agenda-da-turma?code=x&state=y`,
      `${client.origin}/other?code=x&state=y`,
      `${client.redirectUri}?code=x`,
      `${client.redirectUri}?code=&state=x`,
      `${client.redirectUri}?code=x&state=`,
      `${client.redirectUri}?code=x&code=y&state=z`,
      `${client.redirectUri}?code=x&state=y&state=z`,
      `${client.redirectUri}?code=${"x".repeat(2049)}&state=y`,
      `${client.redirectUri}?code=x&state=y#fragment`,
      `${client.redirectUri.replace("https://", "https://user:secret@")}?code=x&state=y`,
      "http://localhost:3002/api/auth/callback/informach-cozya?code=x&state=y",
    ])
      expect(() => webSsoReturnUrl(value, "production")).toThrow();
  });
});
