import { describe, expect, it } from "vitest";
import {
  AceiteDoCancelamentoDaRenovacaoSchema as Aceite,
  ConsultaDoCancelamentoDaRenovacaoSchema as Consulta,
  VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
} from "./renovacao-contrato";

const pedidoId = "abcdef01-0000-4000-8000-000000000001";
const assinaturaId = "abcdef01-0000-4000-8000-000000000002";
const pedido = () => ({
  pedidoId,
  assinaturaId,
  revisaoDoContrato: 1,
  confirmoCancelamentoDaRenovacao: true,
  versaoDasCondicoes: VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
});

describe("cancelamento da renovação: entrada nativa", () => {
  it("normaliza referências UUID sem aceitar referência do Stripe como assinatura", () => {
    expect(
      Aceite.parse({
        ...pedido(),
        pedidoId: pedidoId.toUpperCase(),
        assinaturaId: assinaturaId.toUpperCase(),
      }),
    ).toEqual(pedido());
    expect(Aceite.safeParse({ ...pedido(), assinaturaId: "sub_privada123" }).success).toBe(false);
  });
  it("exige aceite, versão atual e revisão inteira do contrato apresentado", () => {
    for (const invalido of [
      { ...pedido(), confirmoCancelamentoDaRenovacao: false },
      { ...pedido(), versaoDasCondicoes: "antiga" },
      { ...pedido(), revisaoDoContrato: 0 },
      { ...pedido(), revisaoDoContrato: 1.5 },
      { ...pedido(), revisaoDoContrato: 2147483648 },
    ])
      expect(Aceite.safeParse(invalido).success).toBe(false);
  });
  it("não admite conta, provedor, preço ou data escolhidos pelo navegador", () => {
    for (const extra of [
      { contaId: "outra" },
      { groupId: pedidoId },
      { modo: "prod" },
      { providerSubscriptionId: "sub_alheia123" },
      { providerCustomerId: "cus_alheio123" },
      { valor: 0 },
      { fimDoPeriodo: "2027-01-01T00:00:00.000Z" },
    ])
      expect(Aceite.safeParse({ ...pedido(), ...extra }).success).toBe(false);
  });
  it("consulta aceita somente a referência local; ela ainda não autoriza leitura ou execução", () => {
    expect(Consulta.parse({ pedidoId: pedidoId.toUpperCase() })).toEqual({ pedidoId });
    expect(Consulta.safeParse({ pedidoId, executar: true }).success).toBe(false);
    expect(Consulta.safeParse({ pedidoId, contaId: "outra" }).success).toBe(false);
  });
});
