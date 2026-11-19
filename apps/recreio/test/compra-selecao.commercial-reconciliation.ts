import { randomBytes } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  events as audits,
  recreioBillingContracts as contracts,
  recreioGameSessions as games,
  recreioBillingReconciliations as jobs,
  recreioProfiles as profiles,
  recreioPurchaseProfiles as selections,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { avaliarAcesso } from "@/features/acesso/service";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { atualizarCobertura, consultarGrupo, consultarMeuGrupo } from "@/features/grupo/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { trocarIngresso } from "@/features/sessao-de-jogo/service";
import { autorizarExperimento, consultarMeuTeste } from "@/features/teste/service";
import { claimsDe, ingressoDe } from "./jogo-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { pedidoDeTeste } from "./teste-apoio";

async function menor(autor: AutorNativoRecente, apelido = "Jogador sintético") {
  const intencao = await prepararPerfilMenor(autor);
  return cadastrarPerfilMenor(autor, {
    intencaoId: intencao.id,
    perfil: { apelido, avatar: "padrao" },
    nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
    assumoResponsabilidade: true,
    versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
  });
}
type Fixture = Awaited<ReturnType<typeof fixtureDePagamento>>;
async function pagamento(f: Fixture) {
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  f.concluirCheckout();
}
async function confirmar(f: Fixture) {
  const falhas: string[] = [];
  await criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (e) => {
      if (e.payerId === f.adulto.conta.id) falhas.push(e.reasonCode);
    },
  })();
  expect(falhas).toEqual([]);
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  expect(contrato?.purchaseSelectionProcessedAt).toBeInstanceOf(Date);
  if (!contrato) throw new Error("Native initial contract absent");
  return contrato;
}
async function agendar(f: Fixture) {
  await db
    .update(jobs)
    .set({ nextAttemptAt: new Date() })
    .where(and(eq(jobs.payerUserId, f.adulto.conta.id), eq(jobs.providerMode, "dev")));
}

describe("seleção explícita na primeira compra, sem Stripe externo", () => {
  it("sai do teste real de quatro perfis para o Individual escolhido, sem escolher o primeiro", async () => {
    let anteriorSid: string | undefined;
    const f = await fixtureDePagamento(
      true,
      "recreio_individual_monthly",
      undefined,
      async (adulto) => {
        if (!adulto.jogador) throw new Error("Native adult player absent");
        const filhos: string[] = [];
        for (const nome of ["Um", "Dois", "Três"])
          filhos.push((await menor(adulto.autor, nome)).perfil.id);
        await autorizarExperimento(adulto.autor, pedidoDeTeste());
        const aberta = await trocarIngresso({
          ingresso: await ingressoDe(adulto.jogador),
          chaveDeTroca: randomBytes(32).toString("base64url"),
        });
        const sid = claimsDe(aberta.token).sid;
        if (typeof sid !== "string") throw new Error("Native trial SID absent");
        anteriorSid = sid;
        expect((await consultarMeuTeste(adulto.autor)).teste).not.toBeNull();
        const escolhido = filhos.at(-1);
        if (!escolhido) throw new Error("Native selected player absent");
        return [escolhido];
      },
    );
    const guardada = await db
      .select()
      .from(selections)
      .where(eq(selections.purchaseId, f.recibo.id));
    expect(guardada).toHaveLength(4);
    const escolhidos = guardada.filter((p) => p.coverageEnabled).map((p) => p.profileReference);
    expect(escolhidos).toHaveLength(1);
    expect(escolhidos).not.toContain(f.adulto.jogador?.perfil.id);
    await pagamento(f);
    const contrato = await confirmar(f);
    expect(contrato).toMatchObject({
      revision: 1,
      coverageReviewRequired: false,
      currentPlanChangeId: null,
    });
    const atuais = await db.select().from(profiles).where(eq(profiles.groupId, contrato.groupId));
    expect(atuais).toHaveLength(4);
    expect(atuais.filter((p) => p.coverageEnabled).map((p) => p.id)).toEqual(escolhidos);
    if (!anteriorSid) throw new Error("Native trial SID absent");
    const [encerrada] = await db.select().from(games).where(eq(games.id, anteriorSid));
    expect(encerrada?.endedAt).toBeInstanceOf(Date);
  });

  it("perfis mudados durante o pagamento mantêm fatos e exigem confirmação da revisão um", async () => {
    const f = await fixtureDePagamento(true);
    await pagamento(f);
    const grupo = await consultarMeuGrupo(f.adulto.autor);
    if (!grupo) throw new Error("Native group absent");
    await atualizarCobertura(f.adulto.autor, {
      grupoId: grupo.grupoId,
      perfis: grupo.perfis.map((p) => ({ perfilId: p.perfilId, versao: p.versao, cobrir: false })),
    });
    const contrato = await confirmar(f);
    expect(contrato.coverageReviewRequired).toBe(true);
    const [perfil] = await db.select().from(profiles).where(eq(profiles.userId, f.adulto.conta.id));
    expect(perfil?.coverageEnabled).toBe(false);
    const atual = await consultarGrupo(f.adulto.autor, contrato.groupId);
    expect(atual).toMatchObject({ revisaoDaSelecao: 1, limite: 1 });
    await atualizarCobertura(f.adulto.autor, {
      grupoId: atual.grupoId,
      revisaoDoContrato: 1,
      perfis: atual.perfis.map((p) => ({ perfilId: p.perfilId, versao: p.versao, cobrir: true })),
    });
    const [confirmada] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.subscriptionId, contrato.subscriptionId));
    expect(confirmada?.coverageReviewRequired).toBe(false);
    const eventos = await db.select().from(audits).where(eq(audits.actorId, f.adulto.conta.id));
    expect(
      eventos.filter((e) => e.eventType === "recreio.purchase_selection_confirmed"),
    ).toHaveLength(1);
    expect(eventos.some((e) => e.eventType === "recreio.plan_change_selection_confirmed")).toBe(
      false,
    );
  });

  it("a confirmação financeira posterior não reaplica escolhas antigas a um perfil novo", async () => {
    const f = await fixtureDePagamento();
    await pagamento(f);
    const primeiro = await confirmar(f);
    const { perfil } = await criarPerfilProprio(f.adulto.autor, {
      apelido: "Depois da compra",
      avatar: "sol",
    });
    await agendar(f);
    const depois = await confirmar(f);
    expect(depois.purchaseSelectionProcessedAt).toEqual(primeiro.purchaseSelectionProcessedAt);
    expect(depois.coverageReviewRequired).toBe(false);
    expect(await avaliarAcesso({ profileId: perfil.id })).toMatchObject({ podeJogar: true });
    const eventos = await db.select().from(audits).where(eq(audits.actorId, f.adulto.conta.id));
    expect(
      eventos.filter((e) => e.eventType === "recreio.purchase_selection_processed"),
    ).toHaveLength(1);
  });

  it("cadastrar outro menor num Individual ocupado preserva a vaga escolhida", async () => {
    const f = await fixtureDePagamento(true);
    await pagamento(f);
    await confirmar(f);
    const novo = await menor(f.adulto.autor);
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, novo.perfil.id));
    expect(perfil?.coverageEnabled).toBe(false);
    if (!f.adulto.jogador) throw new Error("Native selected player absent");
    expect(await avaliarAcesso({ profileId: f.adulto.jogador.perfil.id })).toMatchObject({
      podeJogar: true,
    });
    await agendar(f);
    expect((await confirmar(f)).coverageReviewRequired).toBe(false);
  });
  it("falha na auditoria da seleção inicial reverte a captura e mantém conferência", async () => {
    const f = await fixtureDePagamento(true);
    await pagamento(f);
    await db.execute(
      sql`create function recreio.recusar_selecao_inicial_fixture() returns trigger language plpgsql as $$ begin if NEW.event_type='recreio.purchase_selection_processed' then raise exception 'fixture initial selection audit failure'; end if; return NEW; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_selecao_inicial_fixture before insert on audit.events for each row execute function recreio.recusar_selecao_inicial_fixture()`,
    );
    const falhas: string[] = [];
    try {
      await criarProcessadorDeConciliacao({
        modo: "dev",
        obterRuntime: () => f.runtimeFinanceiro,
        relatarFalha: (e) => {
          if (e.payerId === f.adulto.conta.id) falhas.push(e.reasonCode);
        },
      })();
      expect(falhas).toHaveLength(1);
      expect(
        await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id)),
      ).toEqual([]);
      const [job] = await db.select().from(jobs).where(eq(jobs.payerUserId, f.adulto.conta.id));
      expect(job).toMatchObject({ reviewRequired: true, lastConfirmedAt: null });
      const eventos = await db.select().from(audits).where(eq(audits.actorId, f.adulto.conta.id));
      expect(eventos.some((e) => e.eventType === "recreio.purchase_selection_processed")).toBe(
        false,
      );
    } finally {
      await db.execute(sql`drop trigger recusar_selecao_inicial_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_selecao_inicial_fixture()`);
    }
  });
});
