import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "../client-ip";

// Os cabeçalhos como a borda do Railway os entrega atrás do Cloudflare.
const ip = (headers: Record<string, string>) => clientIpFromHeaders(new Headers(headers));

describe("clientIpFromHeaders", () => {
  it("usa o X-Real-IP de quem chega por IPv4, com o X-Forwarded-For de dois endereços", () => {
    expect(
      ip({
        "x-real-ip": "198.51.100.7",
        "x-forwarded-for": "198.51.100.7, 172.70.1.2",
        "cf-connecting-ip": "198.51.100.7",
      }),
    ).toBe("198.51.100.7");
  });

  it("lê o CF-Connecting-IP quando quem chega por IPv6 vem com 0.0.0.0", () => {
    expect(
      ip({
        "x-real-ip": "0.0.0.0",
        "cf-connecting-ip": "2804:14d:9606:8060:3c24:3a15:742d:8898",
      }),
    ).toBe("2804:014d:9606:8060:0000:0000:0000:0000");
  });

  it("junta a mesma casa IPv6 (/64) e separa casas diferentes", () => {
    const casa = (addr: string) => ip({ "x-real-ip": "0.0.0.0", "cf-connecting-ip": addr });
    expect(casa("2804:14d:9606:8060::1")).toBe(casa("2804:14d:9606:8060:ffff::2"));
    expect(casa("2804:14d:9606:8060::1")).not.toBe(casa("2804:14d:9606:8061::1"));
  });

  it("ignora o CF-Connecting-IP forjado de quem pula o Cloudflare", () => {
    expect(ip({ "x-real-ip": "203.0.113.9", "cf-connecting-ip": "192.0.2.1" })).toBe("203.0.113.9");
  });

  it("não agrupa quem sai pelo Cloudflare (WARP, Retransmissão Privada)", () => {
    expect(ip({ "x-real-ip": "104.28.10.20", "cf-connecting-ip": "104.28.10.20" })).toBe(
      "104.28.10.20",
    );
  });

  it("não lê o X-Forwarded-For", () => {
    // Sem endereço nos cabeçalhos da regra, o Better Auth devolve 127.0.0.1 em
    // teste (e null em produção): o X-Forwarded-For forjado não vira endereço.
    expect(ip({ "x-forwarded-for": "192.0.2.50" })).toBe("127.0.0.1");
  });
});
