import { describe, expect, it } from "vitest";
import {
  asksToTrustDevice,
  enableProofIdentifier,
  newSetupCode,
  normalizeSetupCode,
  setupCodeIdentifier,
  setupCodePrefix,
} from "./service";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const SESSION = "3f2c1d8e-7a6b-4c5d-9e0f-112233445566";

describe("código por e-mail da ativação das duas etapas", () => {
  it("sorteia sempre 6 números", () => {
    for (let i = 0; i < 200; i += 1) expect(newSetupCode()).toMatch(/^\d{6}$/);
  });

  it("aceita o código com espaços e recusa o resto", () => {
    expect(normalizeSetupCode(" 482 913 ")).toBe("482913");
    expect(normalizeSetupCode("48291")).toBeNull();
    expect(normalizeSetupCode("48291a")).toBeNull();
    expect(normalizeSetupCode("4829133")).toBeNull();
  });

  it("guarda só o HMAC, preso à sessão e ao segredo", () => {
    const identifier = setupCodeIdentifier(SECRET, SESSION, "482913");
    expect(identifier.startsWith(setupCodePrefix(SESSION))).toBe(true);
    expect(identifier).not.toContain("482913");
    expect(setupCodeIdentifier(SECRET, SESSION, "482913")).toBe(identifier);
    expect(setupCodeIdentifier(SECRET, SESSION, "482914")).not.toBe(identifier);
    expect(setupCodeIdentifier(SECRET, "outra-sessao", "482913")).not.toBe(identifier);
    expect(setupCodeIdentifier(`${SECRET}x`, SESSION, "482913")).not.toBe(identifier);
  });

  it("a prova da ativação também fica presa à sessão", () => {
    expect(enableProofIdentifier(SESSION)).toBe(`bastidores:2fa-email-ok:${SESSION}`);
    expect(enableProofIdentifier("outra")).not.toBe(enableProofIdentifier(SESSION));
  });

  it("recusa id de sessão com curinga de LIKE", () => {
    expect(() => setupCodePrefix("abc%")).toThrow();
    expect(() => setupCodePrefix("abc_def")).toThrow();
    expect(() => enableProofIdentifier("")).toThrow();
  });
});

describe("pedido para lembrar o aparelho", () => {
  it("só ausente ou falso passa", () => {
    expect(asksToTrustDevice(undefined)).toBe(false);
    expect(asksToTrustDevice(null)).toBe(false);
    expect(asksToTrustDevice(false)).toBe(false);
    expect(asksToTrustDevice("false")).toBe(false);
    expect(asksToTrustDevice(true)).toBe(true);
    expect(asksToTrustDevice("true")).toBe(true);
    expect(asksToTrustDevice(1)).toBe(true);
    expect(asksToTrustDevice("on")).toBe(true);
  });
});
