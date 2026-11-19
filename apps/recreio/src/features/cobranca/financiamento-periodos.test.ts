import { describe, expect, it } from "vitest";
import { fixtureDeFinanciamento } from "../../../test/financiamento-stripe-apoio";
import { prepararPeriodosDoFinanciamento } from "./financiamento-periodos";

async function fixture() {
  const f = fixtureDeFinanciamento();
  const ler = () =>
    f.conference.conferirCliente(
      {
        clienteId: f.input.clienteId,
        paganteId: "payer_fixture",
        assinaturaIds: [f.input.assinaturaId],
        precosAceitos: f.input.precosAceitos,
      },
      { deadlineMs: Date.now() + 90_000 },
    );
  return { ...f, ler };
}

describe("projeção nativa de períodos com prova de financiamento", () => {
  it("conserva datas originais e inclui faturas sem captura própria somente após a prova", async () => {
    const f = await fixture(),
      conferencia = await f.ler(),
      agora = new Date();
    const [snapshot] = prepararPeriodosDoFinanciamento(conferencia, agora);
    expect(conferencia.leituras[0]?.snapshot.periods).toHaveLength(1);
    expect(snapshot?.periods).toHaveLength(3);
    expect(snapshot?.observedAt).toBe(agora);
    const original = snapshot?.periods.find((p) => p.lineId === "il_original");
    expect(original?.end.getTime()).toBe((1795032000 + 365 * 86400) * 1000);
    expect(
      conferencia.financiamento.periodos.find((p) => p.linhaId === "il_original")?.cobertoAte,
    ).toBe(1795032000);
    expect(snapshot?.periods.every((p) => !p.fullyRefunded && !p.disputed)).toBe(true);
  });
  it("estorno ou contestação da origem não inventa flags na fatura dependente", async () => {
    for (const contestada of [false, true]) {
      const f = await fixture();
      f.charge.disputed = contestada;
      f.charge.refunded = !contestada;
      f.charge.amount_refunded = contestada ? 0 : 59900;
      const conferencia = await f.ler(),
        [snapshot] = prepararPeriodosDoFinanciamento(conferencia, new Date());
      expect(conferencia.financiamento.periodos.every((p) => p.estado === "revogado")).toBe(true);
      expect(snapshot?.periods.find((p) => p.lineId === "il_original")).toMatchObject({
        fullyRefunded: !contestada,
        disputed: contestada,
      });
      expect(
        snapshot?.periods
          .filter((p) => p.lineId !== "il_original")
          .every((p) => !p.fullyRefunded && !p.disputed),
      ).toBe(true);
    }
  });
  it("recusa relógio inválido e não aceita apagar a prova de um período", async () => {
    const f = await fixture(),
      conferencia = await f.ler();
    expect(() => prepararPeriodosDoFinanciamento(conferencia, new Date(Number.NaN))).toThrow();
    conferencia.financiamento.periodos.pop();
    expect(() => prepararPeriodosDoFinanciamento(conferencia, new Date())).toThrow();
  });
});
