import { randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioPlanChanges as changes,
  recreioBillingContracts as contracts,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  recreioPlanChangeProfiles as selections,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarPreparacaoDeReducao } from "@/features/cobranca/troca-cotacao-service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { adultoDoTeste } from "./teste-apoio";

async function fixture(comJogador = false) {
  const f = await fixtureDePagamento(comJogador, "recreio_family_monthly");
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  f.concluirCheckout();
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (e) => {
      falhas.push(e.reasonCode);
    },
  });
  expect((await processar()).conciliadas).toBe(1);
  expect(falhas).toEqual([]);
  const [origem] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
  if (!origem) throw new Error("Native financial origin absent");
  const cotar = criarPreparacaoDeReducao(() => ({ modo: "dev", produtos: f.products }));
  async function pedido() {
    const atuais = await db.select().from(profiles).where(eq(profiles.groupId, origem.groupId));
    return {
      pedidoId: randomUUID(),
      grupoId: origem.groupId,
      produtoDestino: "recreio_individual_monthly",
      revisaoContrato: 1,
      perfis: atuais.map((p) => ({
        perfilId: p.id,
        versao: p.policyVersion,
        cobrir: p.coverageEnabled,
      })),
    };
  }
  return { ...f, origem, cotar, pedido };
}

describe("cotação nativa de redução sem efeito externo", () => {
  it("pagante sem jogador recebe termos fixos e replay sem chamada ao provedor", async () => {
    const f = await fixture(),
      pedido = await f.pedido();
    const antes = f.requests.length;
    const cotacao = await f.cotar(f.adulto.autor, pedido);
    expect(cotacao).toMatchObject({
      id: pedido.pedidoId,
      tipo: "downgrade",
      valorAgoraCentavos: 0,
      valorRenovacaoCentavos: 5990,
      intervalo: "month",
      estado: "quoted",
      aceitoEm: null,
      tentativaEm: null,
    });
    expect(await f.cotar(f.adulto.autor, pedido)).toEqual(cotacao);
    expect(f.requests).toHaveLength(antes);
    expect(JSON.stringify(cotacao)).not.toContain(f.providerCustomerId);
    expect(JSON.stringify(cotacao)).not.toContain("price_");
    expect(JSON.stringify(cotacao)).not.toContain(f.recibo.id);
    const [saved] = await db.select().from(changes).where(eq(changes.id, pedido.pedidoId));
    expect(saved).toMatchObject({
      quotedSubtotalCents: 0,
      quotedCreditCents: 0,
      quotedTotalCents: 0,
      toAmountCents: 5990,
      toInterval: "month",
      acceptedAt: null,
      requestStartedAt: null,
      providerScheduleId: null,
    });
    expect(saved?.effectiveAt).toEqual(saved?.periodEnd);
    await expect(
      f.cotar(f.adulto.autor, { ...pedido, produtoDestino: "recreio_individual_annual" }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
  });

  it("outro adulto e login antigo são recusados antes de registrar a cotação", async () => {
    const f = await fixture(),
      pedido = await f.pedido(),
      outro = await adultoDoTeste();
    await expect(f.cotar(outro.autor, pedido)).rejects.toMatchObject({ code: "GRUPO" });
    await expect(
      f.cotar(
        {
          ...f.adulto.autor,
          login: { ...f.adulto.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) },
        },
        pedido,
      ),
    ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });

  it("revisão ou perfil alterado não autoriza uma escolha antiga", async () => {
    const f = await fixture(true),
      pedido = await f.pedido();
    expect(pedido.perfis).toHaveLength(1);
    await expect(f.cotar(f.adulto.autor, { ...pedido, revisaoContrato: 2 })).rejects.toMatchObject({
      code: "CONFLITO",
    });
    const perfil = pedido.perfis[0];
    if (!perfil) throw new Error("Native profile absent");
    await db
      .update(profiles)
      .set({ policyVersion: perfil.versao + 1 })
      .where(eq(profiles.id, perfil.perfilId));
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toMatchObject({ code: "CONFLITO" });
    expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
  });

  it("seleção reduzida é guardada sem desligar perfis antes do fim pago", async () => {
    const f = await fixture(true);
    const intencao = await prepararPerfilMenor(f.adulto.autor);
    const { perfil } = await cadastrarPerfilMenor(f.adulto.autor, {
      intencaoId: intencao.id,
      perfil: { apelido: "Protegido", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    const pedido = await f.pedido();
    expect(pedido.perfis).toHaveLength(2);
    await expect(f.cotar(f.adulto.autor, pedido)).rejects.toMatchObject({
      code: "LIMITE_DE_PERFIS",
    });
    const escolhas = pedido.perfis.map((p) => ({ ...p, cobrir: p.perfilId !== perfil.id }));
    const cotacao = await f.cotar(f.adulto.autor, { ...pedido, perfis: escolhas });
    const [saved] = await db.select().from(selections).where(eq(selections.profileId, perfil.id));
    expect(saved).toMatchObject({ planChangeId: cotacao.id, coverageEnabled: false });
    const [atual] = await db.select().from(profiles).where(eq(profiles.id, perfil.id));
    expect(atual?.coverageEnabled).toBe(true);
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.purchaseId, f.recibo.id));
    expect(contract).toMatchObject({
      revision: 1,
      currentProductId: "recreio_family_monthly",
      currentPlanChangeId: null,
    });
  });

  it("cotação não enviada vencida pode dar lugar a outra sem alterar a anterior", async () => {
    const f = await fixture(),
      primeiro = await f.pedido();
    await f.cotar(f.adulto.autor, primeiro);
    const segundo = await f.pedido();
    await expect(f.cotar(f.adulto.autor, segundo)).rejects.toMatchObject({
      code: "TROCA_PENDENTE",
    });
    await db.execute(
      sql`update recreio.plan_changes set quoted_at=clock_timestamp()-interval '6 minutes', quote_expires_at=clock_timestamp()-interval '1 minute' where id=${primeiro.pedidoId}`,
    );
    await f.cotar(f.adulto.autor, segundo);
    const [closed] = await db.select().from(changes).where(eq(changes.id, primeiro.pedidoId));
    expect(closed).toMatchObject({
      status: "failed",
      requestStartedAt: null,
      providerScheduleId: null,
    });
    expect(closed?.resolvedAt).not.toBeNull();
  });

  it("falha da auditoria reverte cotação e seleção na mesma transação", async () => {
    const f = await fixture(true),
      pedido = await f.pedido(),
      antes = f.requests.length;
    await db.execute(
      sql`create function recreio.recusar_cotacao_audit_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.plan_change_quoted' then raise exception 'fixture quote audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_cotacao_audit_fixture before insert on audit.events for each row execute function recreio.recusar_cotacao_audit_fixture()`,
    );
    try {
      await expect(f.cotar(f.adulto.autor, pedido)).rejects.toThrow();
      expect(await db.select().from(changes).where(eq(changes.id, pedido.pedidoId))).toEqual([]);
      expect(
        await db.select().from(selections).where(eq(selections.planChangeId, pedido.pedidoId)),
      ).toEqual([]);
      expect(f.requests).toHaveLength(antes);
    } finally {
      await db.execute(sql`drop trigger recusar_cotacao_audit_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_cotacao_audit_fixture()`);
    }
  });
});
