import { describe, expect, it } from "vitest";
import {
  AceitarTrocaSchema,
  type CotacaoParaAceite,
  conferirAceiteDaTroca,
  PrepararTrocaSchema,
  VERSAO_DA_TROCA,
} from "./troca-entrada";

const requestId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const cotacao: CotacaoParaAceite = {
    id: requestId,
    toProductId: "recreio_family_monthly",
    expectedContractRevision: 1,
    quotedAmountCents: 6800,
    quotedSubtotalCents: 12790,
    quotedCreditCents: -5990,
    quotedTotalCents: 6800,
    quotedStartingBalanceCents: 0,
    toAmountCents: 12790,
    toInterval: "month",
    currency: "BRL",
    effectiveAt: new Date("2026-11-18T12:00:00Z"),
    quotedAt: new Date("2026-11-18T12:00:00Z"),
    quoteExpiresAt: new Date("2026-11-18T12:05:00Z"),
    acceptedAt: null,
    policyVersion: VERSAO_DA_TROCA,
  };
  const pedido = {
    pedidoId: requestId,
    produtoDestino: cotacao.toProductId,
    revisaoContrato: 1,
    valorAgoraCentavos: 6800,
    subtotalCentavos: 12790,
    creditoCentavos: -5990,
    totalCentavos: 6800,
    saldoAnteriorCentavos: 0,
    valorRenovacaoCentavos: 12790,
    intervalo: "month",
    moeda: "BRL",
    vigencia: cotacao.effectiveAt.toISOString(),
    versaoDasCondicoes: VERSAO_DA_TROCA,
    aceitoTrocaECobrancaRecorrente: true,
  };
  return { cotacao, pedido, agora: new Date("2026-11-18T12:01:00Z") };
}

describe("aceite vinculado aos termos imutáveis da cotação", () => {
  it("confere cobrança atual, crédito, renovação, revisão, vigência e condições", () => {
    const f = fixture();
    expect(conferirAceiteDaTroca(f.pedido, f.cotacao, f.agora)).toEqual(f.pedido);
    expect(f.cotacao.acceptedAt).toBeNull();
  });
  it.each([
    { pedidoId: "22222222-2222-4222-8222-222222222222" },
    { produtoDestino: "recreio_family_annual" },
    { revisaoContrato: 2 },
    { valorAgoraCentavos: 6799 },
    { subtotalCentavos: 12789 },
    { creditoCentavos: -5991 },
    { totalCentavos: 6799 },
    { saldoAnteriorCentavos: -1 },
    { valorRenovacaoCentavos: 12789 },
    { intervalo: "year" },
    { vigencia: "2026-11-18T12:00:01.000Z" },
  ])("recusa divergência %j", (patch) => {
    const f = fixture();
    expect(() => conferirAceiteDaTroca({ ...f.pedido, ...patch }, f.cotacao, f.agora)).toThrow(
      "termos da cotação",
    );
  });
  it.each([
    { moeda: "USD" },
    { versaoDasCondicoes: "old" },
    { aceitoTrocaECobrancaRecorrente: false },
    { stripePriceId: "price_injected" },
    { valorAgoraCentavos: 1.5 },
    { creditoCentavos: 1 },
    { valorRenovacaoCentavos: 0 },
  ])("não aceita formato ou autoridade extra %j", (patch) => {
    expect(AceitarTrocaSchema.safeParse({ ...fixture().pedido, ...patch }).success).toBe(false);
  });
  it("o vencimento é exclusivo; repetir aceite já registrado conserva o instante original", () => {
    const f = fixture();
    expect(() => conferirAceiteDaTroca(f.pedido, f.cotacao, f.cotacao.quoteExpiresAt)).toThrow(
      "venceu",
    );
    f.cotacao.acceptedAt = f.agora;
    const original = f.cotacao.acceptedAt;
    expect(conferirAceiteDaTroca(f.pedido, f.cotacao, new Date("2026-11-18T13:00:00Z"))).toEqual(
      f.pedido,
    );
    expect(f.cotacao.acceptedAt).toBe(original);
  });
  it("prazo inválido, aceite fora da janela e relógio anterior não viram consentimento", () => {
    const f = fixture();
    expect(() =>
      conferirAceiteDaTroca(f.pedido, f.cotacao, new Date("2026-11-18T11:59:59Z")),
    ).toThrow("venceu");
    f.cotacao.acceptedAt = f.cotacao.quoteExpiresAt;
    expect(() => conferirAceiteDaTroca(f.pedido, f.cotacao, f.agora)).toThrow("nova conferência");
    f.cotacao.acceptedAt = null;
    f.cotacao.quoteExpiresAt = new Date("2026-11-18T12:06:00Z");
    expect(() => conferirAceiteDaTroca(f.pedido, f.cotacao, f.agora)).toThrow("nova conferência");
  });
  it("crédito apresentado é preservado como dado, sem tratá-lo como pagamento confirmado", () => {
    const f = fixture();
    Object.assign(f.cotacao, {
      quotedAmountCents: 0,
      quotedCreditCents: -59900,
      quotedTotalCents: -47110,
    });
    const pedido = {
      ...f.pedido,
      valorAgoraCentavos: 0,
      creditoCentavos: -59900,
      totalCentavos: -47110,
    };
    expect(conferirAceiteDaTroca(pedido, f.cotacao, f.agora)).toEqual(pedido);
    expect(f.cotacao.acceptedAt).toBeNull();
  });
});

describe("preparação usa a seleção nativa completa", () => {
  const perfil = { perfilId: "33333333-3333-4333-8333-333333333333", versao: 1, cobrir: true };
  const entrada = {
    grupoId: "44444444-4444-4444-8444-444444444444",
    perfis: [perfil],
    pedidoId: requestId,
    produtoDestino: "recreio_individual_monthly",
    revisaoContrato: 1,
  };
  it("aceita seleção vazia para pagante sem jogador", () => {
    expect(PrepararTrocaSchema.parse({ ...entrada, perfis: [] }).perfis).toEqual([]);
  });
  it("preserva a recusa de duplicação, excesso e campos financeiros injetados", () => {
    expect(PrepararTrocaSchema.safeParse(entrada).success).toBe(true);
    expect(PrepararTrocaSchema.safeParse({ ...entrada, perfis: [perfil, perfil] }).success).toBe(
      false,
    );
    expect(
      PrepararTrocaSchema.safeParse({ ...entrada, perfis: Array.from({ length: 5 }, () => perfil) })
        .success,
    ).toBe(false);
    expect(
      PrepararTrocaSchema.safeParse({ ...entrada, providerSubscriptionId: "sub_foreign" }).success,
    ).toBe(false);
  });
});
