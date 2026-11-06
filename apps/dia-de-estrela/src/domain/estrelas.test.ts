import { describe, expect, it } from "vitest";
import {
  brl,
  estrelasDaMeta,
  estrelasEmReais,
  precoEmEstrelas,
  previsaoDaMeta,
  rotuloEstrelas,
  saldoLivre,
} from "./estrelas";
import { MODELOS } from "./modelos";

describe("estrelas e dinheiro", () => {
  it("converte pela taxa da casa", () => {
    expect(estrelasEmReais(124, 10)).toBe(brl(1240));
    expect(precoEmEstrelas(500, 10)).toBe(50);
    expect(estrelasDaMeta(90, 10)).toBe(900);
  });
  it("saldo livre desconta o que está guardado em pedidos", () => {
    expect(saldoLivre(124, 50)).toBe(74);
    expect(saldoLivre(10, 50)).toBe(0);
  });
  it("prevê a meta pelo ritmo da última semana", () => {
    expect(previsaoDaMeta(0, 10)).toBe("Você conseguiu!");
    expect(previsaoDaMeta(776, 0)).toBeNull();
    expect(previsaoDaMeta(30, 70)).toBe("faltam uns 3 dias");
    expect(previsaoDaMeta(776, 14)).toBe("faltam umas 56 semanas");
  });
  it("singular e plural", () => {
    expect(rotuloEstrelas(1)).toBe("1 estrela");
    expect(rotuloEstrelas(5)).toBe("5 estrelas");
  });
});

describe("rotinas prontas", () => {
  it("são as 12 tarefas do protótipo, válidas para o banco", () => {
    const todas = MODELOS.flatMap((m) => m.tasks);
    expect(todas).toHaveLength(12);
    for (const t of todas) {
      expect(t.title.length).toBeLessThanOrEqual(40);
      expect(t.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(t.days).toBeGreaterThan(0);
      expect(t.stars).toBeGreaterThanOrEqual(1);
    }
  });
});
