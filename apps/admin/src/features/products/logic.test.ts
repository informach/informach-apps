import { describe, expect, it } from "vitest";
import { funnelBars, parseTab, tabProduct } from "./logic";

describe("abas de Produtos", () => {
  it("aceita só abas conhecidas e começa pelo Cozya", () => {
    expect(parseTab(undefined)).toBe("cozya");
    expect(parseTab("missao-saber")).toBe("missao-saber");
    expect(parseTab(["edi", "cozya"])).toBe("edi");
    expect(parseTab("javascript:alert(1)")).toBe("cozya");
  });

  it("site e Sistema Zero não são produtos com conta", () => {
    expect(tabProduct("cozya")).toBe("cozya");
    expect(tabProduct("site")).toBeNull();
    expect(tabProduct("sistema-zero")).toBeNull();
  });
});

describe("funil", () => {
  it("mede cada passo pelo primeiro e pelo anterior", () => {
    const bars = funnelBars([
      { label: "Criaram conta", value: 200 },
      { label: "Confirmaram o e-mail", value: 180 },
      { label: "Usaram na semana", value: 90 },
      { label: "Assinaram", value: 0 },
    ]);
    expect(bars.map((bar) => bar.width)).toEqual([100, 90, 45, 4]);
    expect(bars[0]?.share).toBeNull();
    expect(bars[1]?.share?.value).toBeCloseTo(0.9);
    expect(bars[1]?.share?.text).toBe("do passo anterior");
    expect(bars[3]?.share?.value).toBe(0);
  });

  it("nunca passa de 100%: passo que não é parte do anterior compara com quem tem conta", () => {
    const bars = funnelBars([
      { label: "Têm conta no produto", value: 200 },
      { label: "Confirmaram o e-mail", value: 180 },
      { label: "Usaram nos últimos 7 dias", value: 40, comparedTo: "first" },
      { label: "Já assinaram alguma vez", value: 60, comparedTo: "first" },
    ]);
    expect(bars[3]?.share).toEqual({ value: 0.3, text: "de quem tem conta" });
    // Sem a comparação certa, 60 sobre 40 daria 150%: fica de fora em vez de enganar.
    const wrong = funnelBars([
      { label: "Usaram", value: 40 },
      { label: "Assinaram", value: 60 },
    ]);
    expect(wrong[1]?.share).toBeNull();
    for (const bar of [...bars, ...wrong]) expect(bar.share?.value ?? 0).toBeLessThanOrEqual(1);
  });

  it("não divide por zero quando ninguém entrou ainda", () => {
    const bars = funnelBars([
      { label: "Criaram conta", value: 0 },
      { label: "Assinaram", value: 0 },
    ]);
    expect(bars.map((bar) => bar.width)).toEqual([4, 4]);
    expect(bars[1]?.share).toBeNull();
  });
});
