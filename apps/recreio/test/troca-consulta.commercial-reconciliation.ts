import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { consultarMinhaCobranca } from "@/features/cobranca/service";
import { criarEncerramentoDeTroca } from "@/features/cobranca/troca-aceite-service";
import { consultarMinhasTrocasNoBanco } from "@/features/cobranca/troca-consulta-repository";
import { criarPreparacaoDeReducao } from "@/features/cobranca/troca-cotacao-service";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

async function fixture() {
  const f = await fixtureDePagamento(false, "recreio_family_monthly");
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  f.concluirCheckout();
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  expect((await processar()).conciliadas).toBe(1);
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!contrato) throw new Error("Native current contract absent");
  const cotacao = await criarPreparacaoDeReducao(() => ({ modo: "dev", produtos: f.products }))(
    f.adulto.autor,
    {
      pedidoId: randomUUID(),
      grupoId: contrato.groupId,
      produtoDestino: "recreio_individual_monthly",
      revisaoContrato: 1,
      perfis: [],
    },
  );
  return { ...f, contrato, cotacao };
}

describe("consulta nativa da troca do próprio pagante", () => {
  it("pagante sem jogador recebe termos, revisão e seleção completos, sem referências do provedor", async () => {
    const f = await fixture();
    const estado = await consultarMinhaCobranca(f.adulto.autor);
    expect(estado.trocas).toMatchObject({
      grupoId: f.contrato.groupId,
      contrato: { produtoId: "recreio_family_monthly", revisao: 1, podePreparar: true },
      pedido: {
        id: f.cotacao.id,
        tipo: "downgrade",
        estado: "quoted",
        perfis: [],
        valorAgoraCentavos: 0,
        valorRenovacaoCentavos: 5990,
      },
    });
    expect(estado.perfis).toEqual([]);
    expect(JSON.stringify(estado.trocas)).not.toContain(f.providerCustomerId);
    expect(JSON.stringify(estado.trocas)).not.toContain(f.adulto.conta.email);
    expect(JSON.stringify(estado.trocas)).not.toContain("provider");
  });
  it("outro adulto e outro modo não recebem o contrato ou o pedido", async () => {
    const f = await fixture(),
      outro = await adultoDoTeste();
    expect(await consultarMinhasTrocasNoBanco(outro.autor, "dev")).toBeNull();
    expect(await consultarMinhasTrocasNoBanco(f.adulto.autor, "prod")).toMatchObject({
      contrato: null,
      pedido: null,
    });
  });
  it("pedido encerrado permanece consultável sem ser apresentado como pendência", async () => {
    const f = await fixture();
    await criarEncerramentoDeTroca(() => "dev")(f.adulto.autor, f.cotacao.id);
    expect((await consultarMinhasTrocasNoBanco(f.adulto.autor, "dev"))?.pedido).toMatchObject({
      id: f.cotacao.id,
      estado: "canceled",
    });
    expect(
      (await consultarMinhasTrocasNoBanco(f.adulto.autor, "dev"))?.pedido?.resolvidoEm,
    ).toBeTypeOf("string");
  });
  it("revogar o aparelho impede leitura dos termos financeiros", async () => {
    const f = await fixture();
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    await expect(consultarMinhasTrocasNoBanco(f.adulto.autor, "dev")).rejects.toMatchObject({
      code: "AUTH",
    });
  });
});
