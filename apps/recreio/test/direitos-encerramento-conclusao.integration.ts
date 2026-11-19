import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioProfileCreationRequests as creationRequests,
  recreioAccountClosureFinances as finances,
  recreioGameSessions as games,
  recreioGroupInvites as invites,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioNativePins as pins,
  recreioProfiles as profiles,
  sessions,
  recreioRightsSubjects as subjects,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { concluirProximoEncerramento } from "@/features/direitos/encerramento-conta-repository";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import { expurgarProximaReferencia } from "@/features/direitos/referencias-retidas-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { convidarAdulto } from "@/features/grupo/convites-service";
import { definirPinDaConta } from "@/features/protecao/service";
import { eventosCom } from "./apoio";
import { livroDoEncerramento } from "./encerramento-financeiro-apoio";
import { adultoDoTeste } from "./teste-apoio";

const semCliente = () => {
  throw new Error("No provider composition for local absence");
};
const convite = (email: string) => ({
  email,
  identificacao: "Adulto",
  declaroMaioridade: true,
  versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
});

describe("encerramento: limpeza e recibo final nativos", () => {
  it("conta sem jogador só conclui após finanças e limpa em lotes, preservando terceiro e identidade global", async () => {
    const a = await adultoDoTeste(),
      b = await adultoDoTeste();
    await definirPinDaConta(a.autor, { pin: "593871" });
    await definirPinDaConta(b.autor, { pin: "396175" });
    const entrada = await convidarAdulto(b.autor, convite(a.conta.email));
    const saida = await convidarAdulto(a.autor, convite(`${randomUUID()}@example.test`));
    const prazo = new Date(Date.now() + 3600_000);
    await db
      .insert(creationRequests)
      .values(Array.from({ length: 103 }, () => ({ userId: a.conta.id, expiresAt: prazo })));
    const [deOutro] = await db
      .insert(creationRequests)
      .values({ userId: b.conta.id, expiresAt: prazo })
      .returning();
    const [pinDeOutro] = await db.select().from(pins).where(eq(pins.userId, b.conta.id));
    const livro = await livroDoEncerramento(a.autor, semCliente);
    const concluir = async () => concluirProximoEncerramento(await livro.coordenar());
    try {
      expect(await concluir()).toEqual({ situacao: "ociosa" });
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      expect(await concluir()).toMatchObject({
        situacao: "dados_da_conta_retirados",
        dominio: "pin_conta",
        quantidade: 1,
      });
      expect(await concluir()).toMatchObject({ dominio: "intencoes_cadastro", quantidade: 100 });
      expect(
        await db.select().from(creationRequests).where(eq(creationRequests.userId, a.conta.id)),
      ).toHaveLength(3);
      expect(await concluir()).toMatchObject({ dominio: "intencoes_cadastro", quantidade: 3 });
      expect(await concluir()).toMatchObject({ dominio: "convites_pendentes", quantidade: 2 });
      for (const id of [entrada.conviteId, saida.conviteId]) {
        expect((await db.select().from(invites).where(eq(invites.id, id)))[0]).toMatchObject({
          state: "revoked",
          recipientEmail: null,
          senderLabel: null,
          recipientUserId: null,
        });
      }
      expect(await concluir()).toMatchObject({
        situacao: "conta_encerrada",
        referenciasRetidas: 0,
      });
      const [fechada] = await db
        .select()
        .from(participations)
        .where(eq(participations.userId, a.conta.id));
      expect(fechada).toMatchObject({
        state: "closed",
        revision: 3,
        operationId: livro.recibo.operacaoId,
        closedAt: expect.any(Date),
      });
      expect(
        (await db.select().from(operations).where(eq(operations.id, livro.recibo.operacaoId)))[0],
      ).toMatchObject({ state: "completed", completedAt: fechada?.closedAt });
      expect(await concluir()).toEqual({ situacao: "ociosa" });
      expect(
        (await db.select().from(participations).where(eq(participations.userId, a.conta.id)))[0],
      ).toEqual(fechada);
      expect(
        (
          await db.select().from(creationRequests).where(eq(creationRequests.userId, b.conta.id))
        )[0],
      ).toEqual(deOutro);
      expect((await db.select().from(pins).where(eq(pins.userId, b.conta.id)))[0]).toEqual(
        pinDeOutro,
      );
      expect((await db.select().from(users).where(eq(users.id, a.conta.id)))[0]).toBeDefined();
      expect(
        (await db.select().from(sessions).where(eq(sessions.id, a.autor.login.authSessionId)))[0],
      ).toBeDefined();
      expect(
        (await eventosCom("operationId", livro.recibo.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_closure_completed",
        ),
      ).toHaveLength(1);
    } finally {
      await livro.fechar();
    }
  });

  it("auditoria recusada reverte participação e conclusão, e a retomada conserva o consentimento", async () => {
    const a = await adultoDoTeste(),
      livro = await livroDoEncerramento(a.autor, semCliente);
    try {
      await livro.processar();
      const [antes] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, livro.recibo.operacaoId));
      await db.execute(
        sql`create function audit.recusar_conta_encerrada() returns trigger language plpgsql as $$ begin if new.event_type='recreio.account_closure_completed' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_conta_encerrada before insert on audit.events for each row execute function audit.recusar_conta_encerrada()`,
      );
      try {
        await expect(concluirProximoEncerramento(await livro.coordenar())).rejects.toBeInstanceOf(
          AuditPersistenceError,
        );
        expect(
          (await db.select().from(participations).where(eq(participations.userId, a.conta.id)))[0],
        ).toMatchObject({ state: "closing", revision: 2, closedAt: null });
        expect(
          (await db.select().from(operations).where(eq(operations.id, livro.recibo.operacaoId)))[0],
        ).toMatchObject({ state: "admitted", completedAt: null });
      } finally {
        await db.execute(sql`drop trigger recusar_conta_encerrada on audit.events`);
        await db.execute(sql`drop function audit.recusar_conta_encerrada()`);
      }
      await db
        .update(operations)
        .set({ nextAttemptAt: sql`clock_timestamp()` })
        .where(eq(operations.id, livro.recibo.operacaoId));
      expect(await concluirProximoEncerramento(await livro.coordenar())).toMatchObject({
        situacao: "conta_encerrada",
      });
      expect(
        (await db.select().from(operations).where(eq(operations.id, livro.recibo.operacaoId)))[0],
      ).toMatchObject({
        consentedAt: antes?.consentedAt,
        authenticatedAt: antes?.authenticatedAt,
        signedIntent: antes?.signedIntent,
        source: antes?.source,
      });
    } finally {
      await livro.fechar();
    }
  });

  it("auditoria recusada também reverte o lote de limpeza, sem remover o PIN silenciosamente", async () => {
    const a = await adultoDoTeste();
    await definirPinDaConta(a.autor, { pin: "593871" });
    const livro = await livroDoEncerramento(a.autor, semCliente);
    try {
      await livro.processar();
      const [antes] = await db.select().from(pins).where(eq(pins.userId, a.conta.id));
      await db.execute(
        sql`create function audit.recusar_lote_conta() returns trigger language plpgsql as $$ begin if new.event_type='recreio.account_closure_data_removed' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_lote_conta before insert on audit.events for each row execute function audit.recusar_lote_conta()`,
      );
      try {
        await expect(concluirProximoEncerramento(await livro.coordenar())).rejects.toBeInstanceOf(
          AuditPersistenceError,
        );
        expect((await db.select().from(pins).where(eq(pins.userId, a.conta.id)))[0]).toEqual(antes);
      } finally {
        await db.execute(sql`drop trigger recusar_lote_conta on audit.events`);
        await db.execute(sql`drop function audit.recusar_lote_conta()`);
      }
      await db
        .update(operations)
        .set({ nextAttemptAt: sql`clock_timestamp()` })
        .where(eq(operations.id, livro.recibo.operacaoId));
      expect(await concluirProximoEncerramento(await livro.coordenar())).toMatchObject({
        situacao: "dados_da_conta_retirados",
        dominio: "pin_conta",
        quantidade: 1,
      });
      expect(await db.select().from(pins).where(eq(pins.userId, a.conta.id))).toEqual([]);
    } finally {
      await livro.fechar();
    }
  });

  it("duas execuções não duplicam o recibo final", async () => {
    const a = await adultoDoTeste(),
      livro = await livroDoEncerramento(a.autor, semCliente);
    try {
      await livro.processar();
      const config = await livro.coordenar();
      const resultados = await Promise.all([
        concluirProximoEncerramento(config),
        concluirProximoEncerramento(config),
      ]);
      expect(resultados.filter((r) => r.situacao === "conta_encerrada")).toHaveLength(1);
      expect(
        (await eventosCom("operationId", livro.recibo.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_closure_completed",
        ),
      ).toHaveLength(1);
    } finally {
      await livro.fechar();
    }
  });

  it("confirmação financeira de outro namespace não autoriza limpar o PIN", async () => {
    const a = await adultoDoTeste();
    await definirPinDaConta(a.autor, { pin: "593871" });
    const livro = await livroDoEncerramento(a.autor, semCliente);
    try {
      await livro.processar();
      await db
        .update(finances)
        .set({ providerMode: "prod" })
        .where(eq(finances.operationId, livro.recibo.operacaoId));
      await expect(concluirProximoEncerramento(await livro.coordenar())).rejects.toMatchObject({
        code: "DIREITOS_INTEGRIDADE",
      });
      expect(await db.select().from(pins).where(eq(pins.userId, a.conta.id))).toHaveLength(1);
      expect(
        (await db.select().from(participations).where(eq(participations.userId, a.conta.id)))[0],
      ).toMatchObject({ state: "closing" });
    } finally {
      await livro.fechar();
    }
  });

  it("retém só a referência até vencer o token original e expurga depois de closed sem reabrir a conta", async () => {
    const a = await adultoDoTeste(true);
    if (!a.jogador) throw new Error("Native player absent");
    const [sessao] = await db
      .insert(games)
      .values({
        profileId: a.jogador.perfil.id,
        deviceSessionId: a.autor.sessaoDeAparelhoId,
        gameId: "morada",
        expiresAt: sql`clock_timestamp()+interval '10 seconds'`,
      })
      .returning();
    if (!sessao) throw new Error("Synthetic original token absent");
    const livro = await livroDoEncerramento(a.autor, semCliente, [a.jogador.perfil.id]);
    try {
      await livro.processar();
      expect(await concluirProximoEncerramento(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(await minimizarProximoPerfil(await livro.coordenar())).toMatchObject({
        situacao: "perfil_minimizado",
        retido: true,
      });
      expect(await concluirProximoEncerramento(await livro.coordenar())).toMatchObject({
        situacao: "conta_encerrada",
        referenciasRetidas: 1,
      });
      const [fechada] = await db
        .select()
        .from(participations)
        .where(eq(participations.userId, a.conta.id));
      expect(
        (
          await db.select().from(subjects).where(eq(subjects.operationId, livro.recibo.operacaoId))
        )[0],
      ).toMatchObject({ phase: "minimized", retainedUntil: sessao.expiresAt });
      await expect
        .poll(async () => expurgarProximaReferencia(await livro.coordenar()), {
          timeout: 15000,
          interval: 100,
        })
        .toMatchObject({ situacao: "referencias_expurgadas", dominio: "sessoes_jogo" });
      expect(await expurgarProximaReferencia(await livro.coordenar())).toMatchObject({
        situacao: "perfil_removido",
      });
      expect(await db.select().from(profiles).where(eq(profiles.id, a.jogador.perfil.id))).toEqual(
        [],
      );
      expect(
        (await db.select().from(participations).where(eq(participations.userId, a.conta.id)))[0],
      ).toEqual(fechada);
      expect(
        (await db.select().from(operations).where(eq(operations.id, livro.recibo.operacaoId)))[0],
      ).toMatchObject({ state: "completed", completedAt: fechada?.closedAt });
    } finally {
      await livro.fechar();
    }
  });
});
