import { describe, expect, it } from "vitest";
import { faixaDoAno } from "../pecas/catalogo";
import {
  elegibilidade,
  ordemDasVezes,
  podio,
  pontosDaVez,
  prazoEsgotado,
  SorteioInsuficiente,
  sortearDesafios,
  sortearProblemas,
} from "./regras";

const pago = { pago: true, perfilLiberado: true, estados: new Map() };
const gratis = { pago: false, perfilLiberado: true, estados: new Map() };

describe("elegibilidade", () => {
  it("a Financeira começa no 6º ano", () => {
    expect(elegibilidade("financeira", 5)).toEqual({
      elegivel: false,
      motivo: "A Financeira começa no 6º ano.",
    });
    expect(elegibilidade("financeira", 8)).toMatchObject({
      elegivel: true,
      nivel: "OLITEF · Nível 2",
    });
  });
  it("Matemática junta Canguru e OBMEP do ano", () => {
    const quinto = elegibilidade("matematica", 5);
    expect(quinto.elegivel).toBe(true);
    if (quinto.elegivel) {
      expect(quinto.nivel).toContain("Canguru");
      expect(quinto.nivel).toContain("OBMEP");
    }
  });
});

describe("sorteio de problemas", () => {
  const base = {
    area: "matematica" as const,
    ano: 5,
    quantidade: 6,
    semente: 42,
    acesso: pago,
    vistos: new Set<string>(),
  };

  it("é reproduzível pela semente e sem repetição", () => {
    const a = sortearProblemas(base).map((p) => p.item.id);
    const b = sortearProblemas(base).map((p) => p.item.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(6);
    expect(sortearProblemas({ ...base, semente: 43 }).map((p) => p.item.id)).not.toEqual(a);
  });

  it("só traz escolha ou número, sem exploração e sem descoberta", () => {
    for (const { item } of sortearProblemas({ ...base, quantidade: 12 })) {
      expect(["choice", "numeric"]).toContain(item.type);
      expect(item.exploration).toBeUndefined();
      expect(item.purpose).not.toBe("discovery");
    }
  });

  it("varia as habilidades antes de repetir", () => {
    const sorteados = sortearProblemas(base);
    expect(new Set(sorteados.map((p) => p.item.skillId)).size).toBeGreaterThan(3);
  });

  it("prefere o que a criança ainda não viu", () => {
    const primeiro = sortearProblemas(base).map((p) => p.item.id);
    const segundo = sortearProblemas({ ...base, semente: 7, vistos: new Set(primeiro) }).map(
      (p) => p.item.id,
    );
    expect(segundo.filter((id) => primeiro.includes(id))).toEqual([]);
  });

  it("sem assinatura, só sorteia de missões gratuitas", () => {
    const sorteados = sortearProblemas({ ...base, acesso: gratis, quantidade: 3 });
    expect(sorteados).toHaveLength(3);
  });

  it("respeita conteúdo pausado para correção", () => {
    const todos = sortearProblemas({ ...base, quantidade: 1 });
    const licao = todos[0]?.lessonId ?? "";
    expect(licao).not.toBe("");
    const estados = new Map([[licao, { status: "suspended" }]]);
    const depois = sortearProblemas({ ...base, quantidade: 20, acesso: { ...pago, estados } });
    expect(depois.every((p) => p.lessonId !== licao)).toBe(true);
  });

  it("avisa quando não há perguntas suficientes", () => {
    expect(() => sortearProblemas({ ...base, area: "financeira", ano: 3, quantidade: 1 })).toThrow(
      SorteioInsuficiente,
    );
  });
});

describe("sorteio de desafios", () => {
  it("fica na faixa da criança e nunca acima dela", () => {
    for (const ano of [2, 4, 6, 9]) {
      const sorteados = sortearDesafios({
        ano,
        quantidade: 3,
        semente: 1,
        acesso: pago,
        vistos: new Set(),
      });
      expect(sorteados).toHaveLength(3);
      const faixa = faixaDoAno(ano);
      expect(sorteados.every((d) => d.faixa <= faixa)).toBe(true);
      expect(sorteados[0]?.faixa).toBe(faixa);
    }
  });
  it("sem assinatura, só desafios abertos", () => {
    const sorteados = sortearDesafios({
      ano: 3,
      quantidade: 1,
      semente: 2,
      acesso: gratis,
      vistos: new Set(),
    });
    expect(sorteados.every((d) => d.gratuito)).toBe(true);
  });
});

describe("vezes, pontos e pódio", () => {
  it("intercala as crianças e deixa os desafios para o fim", () => {
    expect(ordemDasVezes(2, 2, 1).map((v) => `${v.tipo[0]}${v.assento}`)).toEqual([
      "p0",
      "p1",
      "p0",
      "p1",
      "c0",
      "c1",
    ]);
  });
  it("problema vale 1 e desafio vale 3", () => {
    expect(pontosDaVez("problem", true)).toBe(1);
    expect(pontosDaVez("challenge", true)).toBe(3);
    expect(pontosDaVez("challenge", false)).toBe(0);
  });
  it("empate divide a posição", () => {
    const resultado = podio([
      { nome: "Bia", pontos: 5 },
      { nome: "Lia", pontos: 8 },
      { nome: "Theo", pontos: 8 },
    ]);
    expect(resultado.map((c) => [c.nome, c.posicao])).toEqual([
      ["Lia", 1],
      ["Theo", 1],
      ["Bia", 3],
    ]);
  });
  it("o prazo tem folga de 1,5 s para a rede", () => {
    const prazo = new Date("2026-10-31T12:00:00Z");
    expect(prazoEsgotado(prazo, new Date("2026-10-31T12:00:01.400Z"))).toBe(false);
    expect(prazoEsgotado(prazo, new Date("2026-10-31T12:00:01.600Z"))).toBe(true);
  });
});
