import { describe, expect, it } from "vitest";
import { cameFromSignInNext, safeNext } from "./safe-next";

describe("safeNext, o caminho de volta depois da entrada", () => {
  it("mantém caminho, busca e âncora do próprio Bastidores", () => {
    expect(safeNext("/operacao?aba=rotinas#emails")).toBe("/operacao?aba=rotinas#emails");
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

  it("nunca devolve rota de API: volta para a tela da Auditoria", () => {
    // Depois da senha e do código, a navegação sai de dentro (same-origin) e
    // exportaria a auditoria sem o clique no botão.
    for (const value of [
      "/api/auditoria/export?periodo=tudo",
      "/api/auditoria/export",
      "/api",
      "/api/",
      "/API/auditoria/export",
      "/%61pi/auditoria/export",
      "/./api/auditoria/export",
      "/pessoas/../api/auditoria/export",
      "/api/jobs/admin-watch",
    ]) {
      expect(safeNext(value), value).toBe("/auditoria");
    }
    expect(safeNext("/apis")).toBe("/apis");
    expect(safeNext("/auditoria?grupo=equipe")).toBe("/auditoria?grupo=equipe");
  });

  it("marca a ficha que chega pelo next, para a página perguntar antes de gravar", () => {
    expect(safeNext("/pessoas/abc")).toBe("/pessoas/abc?confirmar=1");
    expect(safeNext("/pessoas/abc/")).toBe("/pessoas/abc/?confirmar=1");
    expect(safeNext("/pessoas/abc?aba=sessoes#emails")).toBe(
      "/pessoas/abc?aba=sessoes&confirmar=1#emails",
    );
    // A tela de entrada filtra no servidor e de novo no navegador: a marca não duplica.
    expect(safeNext(safeNext("/pessoas/abc"))).toBe("/pessoas/abc?confirmar=1");
    // Lista de Pessoas não grava nada e abre direto.
    expect(safeNext("/pessoas?q=marina")).toBe("/pessoas?q=marina");
    expect(cameFromSignInNext({ confirmar: "1" })).toBe(true);
    expect(cameFromSignInNext({ aba: "sessoes" })).toBe(false);
  });

  it("recusa texto longo demais e percent-encoding quebrado", () => {
    expect(safeNext(`/${"a".repeat(2100)}`)).toBe("/");
    expect(safeNext("/%E0%A4%A")).toBe("/");
  });
});
