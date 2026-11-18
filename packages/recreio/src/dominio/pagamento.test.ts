import { describe, expect, it } from "vitest";
import {
  type FatosDoPagamento,
  limiteDoPagamentoConciliado,
  VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS,
} from "./pagamento";

const agora = new Date("2026-11-18T12:00:00Z");
const em = (ms: number) => new Date(agora.getTime() + ms);
function fatos(mudancas: Partial<FatosDoPagamento> = {}): FatosDoPagamento {
  return {
    status: "active",
    precoId: "price_aprovado",
    inicioDoPeriodo: em(-60_000),
    fimDoPeriodo: em(86_400_000),
    fimDoTeste: null,
    cancelaEm: null,
    origemAdmitida: true,
    conferidoEm: em(-60_000),
    emConferencia: false,
    periodos: [
      {
        precoId: "price_aprovado",
        inicio: em(-60_000),
        fim: em(86_400_000),
        pagoEm: em(-30_000),
        estornado: false,
        contestado: false,
        financiadoAte: em(86_400_000),
      },
    ],
    ...mudancas,
  };
}

describe("pagamento conciliado não equivale a status espelhado", () => {
  it("limita pela conferência e pelo menor prazo financeiro/contratual", () => {
    expect(limiteDoPagamentoConciliado(fatos(), agora)).toEqual(em(14 * 60_000));
    expect(limiteDoPagamentoConciliado(fatos({ fimDoPeriodo: em(20_000) }), agora)).toEqual(
      em(20_000),
    );
    const f = fatos();
    f.periodos = f.periodos.map((p) => ({ ...p, fim: em(10_000) }));
    expect(limiteDoPagamentoConciliado(f, agora)).toEqual(em(10_000));
    expect(limiteDoPagamentoConciliado(fatos({ cancelaEm: em(5000) }), agora)).toEqual(em(5000));
  });
  const negativas: [string, Partial<FatosDoPagamento>][] = [
    ["status ativo sem fatura", { periodos: [] }],
    ["origem não comprovada", { origemAdmitida: false }],
    ["revisão pendente", { emConferencia: true }],
    ["conferência ausente", { conferidoEm: null }],
    ["conferência futura", { conferidoEm: em(1) }],
    ["conferência vencida exatamente", { conferidoEm: em(-VALIDADE_DA_CONFERENCIA_FINANCEIRA_MS) }],
    ["período futuro", { inicioDoPeriodo: em(1) }],
    ["período encerrado exatamente", { fimDoPeriodo: agora }],
    ["cancelamento encerrado", { cancelaEm: agora }],
    ["cobrança inadimplente", { status: "past_due" }],
    ["assinatura encerrada", { status: "canceled" }],
    ["teste sem prazo próprio", { status: "trialing" }],
  ];
  it("prova revogada/ausente não financia e o crédito retirado limita a data original", () => {
    for (const financiadoAte of [null, agora, new Date(Number.NaN)]) {
      const f = fatos();
      f.periodos = f.periodos.map((p) => ({ ...p, financiadoAte }));
      expect(limiteDoPagamentoConciliado(f, agora)).toBeNull();
    }
    const f = fatos();
    f.periodos = f.periodos.map((p) => ({ ...p, financiadoAte: em(3000) }));
    expect(limiteDoPagamentoConciliado(f, agora)).toEqual(em(3000));
  });
  it.each(negativas)("recusa %s", (_nome, mudancas) =>
    expect(limiteDoPagamentoConciliado(fatos(mudancas), agora)).toBeNull(),
  );
  it.each(["estornado", "contestado", "preco", "futuro", "data-invalida"] as const)(
    "não usa período %s para liberar",
    (tipo) => {
      const f = fatos();
      f.periodos = f.periodos.map((p) => ({
        ...p,
        estornado: tipo === "estornado",
        contestado: tipo === "contestado",
        precoId: tipo === "preco" ? "price_outro" : p.precoId,
        pagoEm:
          tipo === "futuro" ? em(1) : tipo === "data-invalida" ? new Date(Number.NaN) : p.pagoEm,
      }));
      expect(limiteDoPagamentoConciliado(f, agora)).toBeNull();
    },
  );
  it("não transfere estorno de fatura antiga para o período pago atual; disputa exige conferência", () => {
    const f = fatos(),
      atual = f.periodos[0];
    if (!atual) throw new Error("Paid period fixture absent");
    f.periodos = [{ ...atual, inicio: em(-86_400_000), fim: em(-60_000), estornado: true }, atual];
    expect(limiteDoPagamentoConciliado(f, agora)).toEqual(em(14 * 60_000));
    f.periodos = f.periodos.map((p, i) => ({ ...p, contestado: i === 0 }));
    expect(limiteDoPagamentoConciliado(f, agora)).toBeNull();
  });
  it("um teste do provedor sem fatura continua sem prova; com pagamento usa também o prazo do teste", () => {
    expect(
      limiteDoPagamentoConciliado(
        fatos({ status: "trialing", fimDoTeste: em(5000), periodos: [] }),
        agora,
      ),
    ).toBeNull();
    expect(
      limiteDoPagamentoConciliado(fatos({ status: "trialing", fimDoTeste: em(5000) }), agora),
    ).toEqual(em(5000));
  });
});
