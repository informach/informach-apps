import { randomBytes, randomUUID } from "node:crypto";
import { db, eq, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioRightsProfileProjection,
  recreioRightsWorldProjection,
  sessions,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { criarAssinaturaDoLivro, resumoDoRegistro } from "@/features/direitos/livro/assinatura";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { codigoDoBanco, loginReal, novaConta } from "./apoio";

async function cenario() {
  const conta = await novaConta(),
    login = await loginReal(conta);
  const contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const { perfil } = await criarPerfilProprio(autor, {
    apelido: "Pessoa protegida",
    avatar: "padrao",
  });
  const previa = await prepararPedidoDeDireitos(autor, {
    pedidoId: randomUUID(),
    tipo: "retirar_perfil",
    perfis: [perfil.id],
  });
  const assinatura = criarAssinaturaDoLivro({
    livroId: randomUUID(),
    chaveAtiva: "fixture",
    chaves: new Map([["fixture", randomBytes(32)]]),
  });
  const id = randomUUID(),
    agora = new Date();
  try {
    const bytes = assinatura.assinarIntencao({
      formato: "recreio-intencao-direitos-v1",
      livroId: assinatura.livroId,
      operacaoId: id,
      revisao: 1,
      epoca: 0,
      tipo: "retirar_perfil",
      contaId: conta.id,
      perfilIds: [perfil.id],
      planoSha256: previa.planoSha256,
      consentidaEm: agora.toISOString(),
      autenticadaEm: sessao.createdAt.toISOString(),
      fonte: "a".repeat(40),
    });
    await db.insert(operations).values({
      id,
      preparationId: previa.preparacaoId,
      requesterUserId: conta.id,
      planSha256: previa.planoSha256,
      kind: "retirar_perfil",
      ledgerId: assinatura.livroId,
      ledgerEpoch: 0,
      signingKeyId: assinatura.chaveAtiva,
      source: "a".repeat(40),
      signedIntent: bytes,
      intentSha256: resumoDoRegistro(bytes),
      authenticatedAt: sessao.createdAt,
      consentedAt: agora,
      createdAt: agora,
      updatedAt: agora,
      nextAttemptAt: agora,
    });
  } finally {
    assinatura.encerrar();
  }
  const [mundo] = await db
    .insert(spaces)
    .values({
      gameId: "morada",
      name: "Mundo protegido",
      contentPolicy: "family",
      stewardProfileId: perfil.id,
      createdByProfileId: perfil.id,
    })
    .returning();
  if (!mundo) throw new Error("World absent");
  await db
    .update(profiles)
    .set({
      status: "suspended",
      rightsOperationId: id,
      rightsFrozenState: recreioRightsProfileProjection({ ...profiles, status: sql`'suspended'` }),
    })
    .where(eq(profiles.id, perfil.id));
  await db
    .update(spaces)
    .set({
      status: "archived",
      rightsOperationId: id,
      rightsFrozenState: recreioRightsWorldProjection({ ...spaces, status: sql`'archived'` }),
    })
    .where(eq(spaces.id, mundo.id));
  return { id, perfilId: perfil.id, mundoId: mundo.id, previa };
}

describe("barreiras persistidas de direitos (PostgreSQL real)", () => {
  it("recusa reativação, nomes e permissão por writer antigo sem reescrever a projeção", async () => {
    const c = await cenario();
    for (const alteracao of [
      { status: "active" as const },
      { nickname: "Nome substituído" },
      { coverageEnabled: false },
      { policyVersion: 22 },
      { userId: null },
      { createdAt: new Date(0) },
    ]) {
      const codigo = await codigoDoBanco(
        db.update(profiles).set(alteracao).where(eq(profiles.id, c.perfilId)),
      );
      expect(codigo).toBe("23514");
    }
    const [p] = await db.select().from(profiles).where(eq(profiles.id, c.perfilId));
    expect(p?.status).toBe("suspended");
    expect(p?.nickname).toBe("Pessoa protegida");
  });

  it("recusa desarquivamento, fotos, diário, cerca, autoria, resumo e retenção por writer antigo", async () => {
    const c = await cenario();
    for (const alteracao of [
      { status: "hibernating" as const },
      { name: "Nome novo" },
      { revision: 1 },
      { journalSeq: 1 },
      { leaseEpoch: 1 },
      { managementRevision: 2 },
      { stewardProfileId: null },
      { createdByProfileId: null },
      { summary: { texto: "Novo conteúdo" } },
      { archivedAt: new Date() },
      { createdAt: new Date(0) },
    ]) {
      expect(
        await codigoDoBanco(db.update(spaces).set(alteracao).where(eq(spaces.id, c.mundoId))),
      ).toBe("23514");
    }
  });

  it("NULL não atravessa o CHECK e uma operação inexistente não constitui barreira", async () => {
    const c = await cenario();
    expect(
      await codigoDoBanco(
        db.update(profiles).set({ rightsFrozenState: null }).where(eq(profiles.id, c.perfilId)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(profiles).set({ rightsOperationId: null }).where(eq(profiles.id, c.perfilId)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(spaces).set({ rightsFrozenState: null }).where(eq(spaces.id, c.mundoId)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(spaces).set({ rightsOperationId: randomUUID() }).where(eq(spaces.id, c.mundoId)),
      ),
    ).toBe("23503");
  });

  it("permite manutenção técnica e passo coordenado, sem dependência do timezone da conexão", async () => {
    const c = await cenario();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local timezone='Pacific/Auckland'`);
      await tx.update(profiles).set({ updatedAt: new Date() }).where(eq(profiles.id, c.perfilId));
      await tx
        .update(spaces)
        .set({
          updatedAt: new Date(),
          name: "Mundo sem autoria",
          rightsFrozenState: recreioRightsWorldProjection({
            ...spaces,
            name: sql`'Mundo sem autoria'`,
          }),
        })
        .where(eq(spaces.id, c.mundoId));
    });
    const [mundo] = await db.select().from(spaces).where(eq(spaces.id, c.mundoId));
    expect(mundo?.name).toBe("Mundo sem autoria");
  });

  it("preserva a prévia e a operação referenciadas; não admite conclusão ou lease parciais", async () => {
    const c = await cenario();
    expect(
      await codigoDoBanco(
        db.delete(preparations).where(eq(preparations.id, c.previa.preparacaoId)),
      ),
    ).toBe("23503");
    expect(await codigoDoBanco(db.delete(operations).where(eq(operations.id, c.id)))).toBe("23503");
    for (const alteracao of [
      { state: "completed" as const },
      { state: "admitted" as const },
      { admittedAt: new Date() },
      { leaseToken: randomUUID() },
      { state: "review" as const },
      { completedAt: new Date() },
    ]) {
      expect(
        await codigoDoBanco(db.update(operations).set(alteracao).where(eq(operations.id, c.id))),
      ).toBe("23514");
    }
  });

  it("conserva a referência histórica depois da remoção coordenada do perfil vivo", async () => {
    const c = await cenario();
    await db
      .insert(subjects)
      .values({
        operationId: c.id,
        profileReference: c.perfilId,
        liveProfileId: c.perfilId,
        policyVersion: 1,
      });
    // A etapa coordenada desvincula as referências do mundo e a sua projeção
    // na mesma transação; a cascata da FK não pode contornar o CHECK congelado.
    await db.transaction(async (tx) => {
      await tx
        .update(spaces)
        .set({
          stewardProfileId: null,
          createdByProfileId: null,
          rightsFrozenState: recreioRightsWorldProjection({
            ...spaces,
            stewardProfileId: sql`null`,
            createdByProfileId: sql`null`,
          }),
        })
        .where(eq(spaces.id, c.mundoId));
      await tx.delete(profiles).where(eq(profiles.id, c.perfilId));
    });
    const [recibo] = await db.select().from(subjects).where(eq(subjects.operationId, c.id));
    expect(recibo?.profileReference).toBe(c.perfilId);
    expect(recibo?.liveProfileId).toBeNull();
    expect((await db.select().from(operations).where(eq(operations.id, c.id))).length).toBe(1);
  });
});
