import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext, o caminho de volta depois da entrada", () => {
  it("mantém caminho, busca e âncora do próprio Bastidores", () => {
    expect(safeNext("/pessoas/abc?aba=sessoes#emails")).toBe("/pessoas/abc?aba=sessoes#emails");
    expect(safeNext("/auditoria?pessoa=fulana%40example.com")).toBe(
      "/auditoria?pessoa=fulana%40example.com",
    );
    expect(safeNext(["/operacao", "/dinheiro"])).toBe("/operacao");
  });

  it("volta ao painel sem valor", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext([])).toBe("/");
  });

  it("recusa endereço que o navegador lê como outro site", () => {
    for (const value of [
      "//x",
      "//evil.example",
      "/\\x",
      "/\\evil.example",
      "\\\\evil.example",
      "/.//evil.example",
      "/%2F%2Fx",
      "/%2f%2fevil.example",
      "/%5Cevil.example",
      "/%09/x",
      "/%0a/evil.example",
    ]) {
      expect(safeNext(value), value).toBe("/");
    }
  });

  it("recusa esquemas e endereços absolutos", () => {
    for (const value of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,oi",
      "https://evil.example/pessoas",
      "http:evil.example",
      "evil.example",
    ]) {
      expect(safeNext(value), value).toBe("/");
    }
  });

  it("recusa caractere de controle, que o navegador apaga antes de seguir", () => {
    for (const value of ["/\t/evil.example", "/\n/evil.example", "/\r\n/x", "/x\u0000", " //x"]) {
      expect(safeNext(value), JSON.stringify(value)).toBe("/");
    }
  });

  it("recusa texto longo demais e percent-encoding quebrado", () => {
    expect(safeNext(`/${"a".repeat(2100)}`)).toBe("/");
    expect(safeNext("/%E0%A4%A")).toBe("/");
  });
});
