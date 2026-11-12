import { describe, expect, it } from "vitest";
import { jogoDoCaminho, montarCsp } from "./csp";

const NONCE = "bm9uY2UtZGUtdGVzdGU=";

describe("política do portal", () => {
  // Estas são as políticas que o portal entregava antes de existir a página do
  // jogo, letra por letra. Mudar uma delas é uma decisão, não um efeito colateral.
  it("em produção é a de sempre", () => {
    expect(montarCsp({ nonce: NONCE, dev: false })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; ` +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "worker-src 'self'; " +
        "connect-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'",
    );
  });

  it("em desenvolvimento ganha só o que o recarregamento do Next precisa", () => {
    expect(montarCsp({ nonce: NONCE, dev: true })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval'; ` +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "worker-src 'self'; " +
        "connect-src 'self' ws: wss:; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'",
    );
  });

  it("sem as origens de um jogo, a página fica com a política do portal", () => {
    expect(montarCsp({ nonce: NONCE, dev: false, jogo: null })).toBe(
      montarCsp({ nonce: NONCE, dev: false }),
    );
  });
});

describe("política da página de um jogo", () => {
  it("acrescenta a instância do jogo, workers de blob e WebAssembly, e mais nada", () => {
    expect(montarCsp({ nonce: NONCE, dev: false, jogo: { ws: "wss://morada.example.test" } })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'wasm-unsafe-eval'; ` +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "media-src 'self' data: blob:; " +
        "font-src 'self'; " +
        "worker-src 'self' blob:; " +
        "connect-src 'self' wss://morada.example.test; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'",
    );
  });

  it("a origem da arte só entra quando o jogo a declara", () => {
    const csp = montarCsp({
      nonce: NONCE,
      dev: false,
      jogo: { ws: "wss://morada.example.test", assets: "https://arte.example.test" },
    });
    expect(csp).toContain(
      "connect-src 'self' wss://morada.example.test https://arte.example.test;",
    );
    expect(csp).toContain("img-src 'self' data: blob: https://arte.example.test;");
    expect(csp).toContain("media-src 'self' data: blob: https://arte.example.test;");
  });

  it("não libera eval de texto em produção nem WebSocket para qualquer lugar", () => {
    const csp = montarCsp({ nonce: NONCE, dev: false, jogo: { ws: "ws://localhost:3019" } });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws://localhost:3019;");
    expect(csp).not.toMatch(/connect-src[^;]* wss?:(;| )/);
  });

  it.each([
    "wss://morada.example.test; script-src *",
    "wss://morada.example.test/caminho",
    "wss://morada.example.test 'unsafe-inline'",
    "wss://usuario:senha@morada.example.test",
    "https://morada.example.test",
    "javascript:alert(1)",
    "não é um endereço",
  ])("um endereço de instância que não é só esquema e host fica de fora (%s)", (ws) => {
    const csp = montarCsp({ nonce: NONCE, dev: false, jogo: { ws } });
    expect(csp).toContain("connect-src 'self';");
    expect(csp.split("; ")).toHaveLength(12);
  });

  it.each([
    "https://arte.example.test; script-src *",
    "https://arte.example.test/pasta",
    "wss://arte.example.test",
    "data:text/html,x",
  ])("uma origem de arte que não é só esquema e host fica de fora (%s)", (assets) => {
    const csp = montarCsp({
      nonce: NONCE,
      dev: false,
      jogo: { ws: "wss://morada.example.test", assets },
    });
    expect(csp).toContain("connect-src 'self' wss://morada.example.test;");
    expect(csp).toContain("img-src 'self' data: blob:;");
    expect(csp.split("; ")).toHaveLength(12);
  });
});

describe("jogoDoCaminho", () => {
  it("só reconhece a página de um jogo", () => {
    expect(jogoDoCaminho("/jogar/morada")).toBe("morada");
    expect(jogoDoCaminho("/jogar/teste/")).toBe("teste");
    expect(jogoDoCaminho("/jogar")).toBeNull();
    expect(jogoDoCaminho("/jogar/")).toBeNull();
    expect(jogoDoCaminho("/jogar/morada/outra")).toBeNull();
    expect(jogoDoCaminho("/estante")).toBeNull();
    expect(jogoDoCaminho("/x/jogar/morada")).toBeNull();
    expect(jogoDoCaminho("/jogar/%E0%A4%A")).toBeNull();
  });
});
