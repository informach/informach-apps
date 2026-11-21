import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioFriendCodes as codes,
  recreioDeviceSessions as devices,
  recreioDirectedSpaceInvites as directed,
  recreioGameSessions as gameSessions,
  recreioGroupInvites as groupInvites,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioMinorProfiles as minors,
  recreioRightsOperations as operations,
  recreioSocialPreferences as preferences,
  recreioProfiles as profiles,
  recreioRightsWorldProjection,
  sessions,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioProfileWorldTraces as traces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { concluirProximaRetirada } from "@/features/direitos/conclusao-repository";
import { liberarProximoMundoDeDireitos } from "@/features/direitos/liberacao-mundo-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { expurgarProximaReferencia } from "@/features/direitos/referencias-retidas-repository";
import { consentirRetiradaNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { consultarMeusDireitos, prepararPedidoDeDireitos } from "@/features/direitos/service";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { criarPerfilProprio, selecionarPerfil } from "@/features/perfis/service";
import {
  definirPinDaConta,
  definirPinDoMenor,
  trocarPerfilComPin,
} from "@/features/protecao/service";
import { resolverAtor } from "@/features/sessao/service";
import { processarProximaFotografiaDeDireitos } from "../scripts/direitos/fotografias";
import { processarRodadaDeDireitos } from "../scripts/direitos/rodada";
import { loginReal, novaConta } from "./apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";

async function adulto() {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  return { conta, login, autor };
}
async function jogador(a: Awaited<ReturnType<typeof adulto>>) {
  return (await criarPerfilProprio(a.autor, { apelido: "Pessoa privada", avatar: "padrao" }))
    .perfil;
}
async function runtime() {
  return { livro: fixtureDoLivro(), http: await criarBucketDoLivro() };
}
function compor(r: Awaited<ReturnType<typeof runtime>>) {
  const assinatura = r.livro.assinatura,
    storage = criarArmazenamentoDoLivro({
      assinatura,
      cliente: r.http.cliente,
      bucket: "recreio-fixture",
      tempoLimiteMs: 2000,
    });
  return {
    storage,
    async fotografar() {
      return processarProximaFotografiaDeDireitos({
        assinatura,
        storage,
        leitor: null,
        politica: { retirarTextosDaFundacao: true },
      });
    },
    async liberar() {
      return liberarProximoMundoDeDireitos({
        assinatura,
        prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 2000 }),
      });
    },
    async admitir(autor: AutorNativoRecente, perfilId: string) {
      const previa = await prepararPedidoDeDireitos(autor, {
        pedidoId: randomUUID(),
        tipo: "retirar_perfil",
        perfis: [perfilId],
      });
      const op = await consentirRetiradaNoBanco(
        autor,
        {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
          confirmoRetirada: true,
        },
        { assinatura, fonte: "a".repeat(40), epoca: 0 },
      );
      await publicarProximoConsentimento({ assinatura, storage });
      // Mundos desta fixture não têm estado do jogo; o passo real registra sua
      // conclusão de fotos vazias, sem criar um jogador ou foto artificial.
      await processarProximaFotografiaDeDireitos({
        assinatura,
        storage,
        leitor: null,
        politica: { retirarTextosDaFundacao: true },
      });
      return op;
    },
    async rodada() {
      return processarRodadaDeDireitos({
        assinatura,
        storage,
        leitor: null,
        politica: { retirarTextosDaFundacao: true },
      });
    },
    async expurgar() {
      return expurgarProximaReferencia({
        assinatura,
        prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 2000 }),
      });
    },
    async concluir() {
      return concluirProximaRetirada({
        assinatura,
        prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 2000 }),
      });
    },
    async executar() {
      const prova = await conferirPrefixoDoLivro({
        storage,
        maxEntradas: 100,
        tempoLimiteMs: 2000,
      });
      return minimizarProximoPerfil({ assinatura, prova });
    },
  };
}
async function cenario(fn: (f: ReturnType<typeof compor>) => Promise<void>) {
  const r = await runtime();
  try {
    const f = compor(r);
    await f.storage.iniciarCabecalho(r.livro.assinatura.assinarCabecalho(r.livro.inicial));
    await fn(f);
  } finally {
    r.livro.encerrar();
    await r.http.fechar();
  }
}

describe("minimização nativa sem reabrir autoridade", () => {
  it("rodada ociosa confere custódia com um GET e recusa indisponibilidade/livro congelado", async () => {
    const r = await runtime();
    try {
      const f = compor(r);
      await f.storage.iniciarCabecalho(r.livro.assinatura.assinarCabecalho(r.livro.inicial));
      const antes = r.http.pedidos.length;
      expect(await f.rodada()).toMatchObject({
        etapas: [],
        publishing: 0,
        processing: 0,
        review: 0,
        purgeDue: 0,
      });
      const pedidos = r.http.pedidos.slice(antes);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0]).toMatchObject({
        metodo: "GET",
        path: expect.stringMatching(/\/cabecalho\.json$/),
      });
      r.http.estado.negar = true;
      await expect(f.rodada()).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      r.http.estado.negar = false;
      await f.storage.congelarCabecalho(await f.storage.lerCabecalho(), new Date().toISOString());
      await expect(f.rodada()).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      expect(
        await db.select().from(operations).where(eq(operations.ledgerId, r.livro.livroId)),
      ).toHaveLength(0);
    } finally {
      r.livro.encerrar();
      await r.http.fechar();
    }
  });

  it("libera um mundo por passagem com sujeito ausente e reverte a liberação se a auditoria falhar", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        perfil = await jogador(a),
        outro = await jogador(b);
      const casas = await db
        .insert(spaces)
        .values(
          ["Um", "Dois"].map((nome) => ({
            gameId: "morada",
            name: `Compartilhado ${nome}`,
            contentPolicy: "family" as const,
            createdByProfileId: outro.id,
            stewardProfileId: outro.id,
          })),
        )
        .returning();
      expect(casas).toHaveLength(2);
      await db.insert(members).values(
        casas.map((m) => ({
          spaceId: m.id,
          profileId: outro.id,
          role: "steward" as const,
          state: "active" as const,
        })),
      );
      await db.insert(traces).values(casas.map((m) => ({ profileId: perfil.id, spaceId: m.id })));
      const membrosAntes = await db.select().from(members).where(eq(members.profileId, outro.id));
      const op = await f.admitir(a.autor, perfil.id);
      await f.fotografar(); // Both empty worlds reach dependencies through the actual adapter.
      expect(await f.liberar()).toEqual({ situacao: "ociosa" }); // A live selected subject remains.
      expect((await f.executar()).situacao).toBe("perfil_minimizado");
      const etapas = () =>
        db
          .select()
          .from(worlds)
          .where(eq(worlds.operationId, op.operacaoId))
          .orderBy(worlds.spaceId);
      expect((await etapas()).map((m) => m.phase)).toEqual(["dependencies", "dependencies"]);
      expect(await f.expurgar()).toEqual({ situacao: "ociosa" });
      // Emulate an absence receipt in a restored copy, AFTER the real native
      // minimizer has removed personal content. This is a state fixture, not a
      // claim of a full cold restore; the original consent/preparation remain.
      await db.transaction(async (tx) => {
        await tx
          .update(subjects)
          .set({ phase: "removed", liveProfileId: null, completedAt: sql`statement_timestamp()` })
          .where(eq(subjects.operationId, op.operacaoId));
        await tx.delete(profiles).where(eq(profiles.id, perfil.id));
      });
      expect(await f.liberar()).toMatchObject({ situacao: "mundo_liberado", quantidade: 1 });
      expect((await etapas()).filter((m) => m.phase === "completed")).toHaveLength(1);
      expect(await f.concluir()).toEqual({ situacao: "ociosa" });
      const antesDaFalha = await etapas();
      await db.execute(sql`create function audit.recusar_liberacao_mundo_fixture() returns trigger language plpgsql as $$ begin
        if new.event_type='recreio.rights_world_released' then raise exception 'auditoria indisponivel'; end if; return new; end $$`);
      await db.execute(sql`create trigger recusar_liberacao_mundo_fixture before insert on audit.events
        for each row execute function audit.recusar_liberacao_mundo_fixture()`);
      try {
        await expect(f.liberar()).rejects.toBeInstanceOf(AuditPersistenceError);
        expect(await etapas()).toEqual(antesDaFalha);
        const pendente = antesDaFalha.find((m) => m.phase === "dependencies");
        if (!pendente) throw new Error("Pending world absent");
        expect(
          (await db.select().from(spaces).where(eq(spaces.id, pendente.spaceId)))[0],
        ).toMatchObject({ status: "archived", rightsOperationId: op.operacaoId });
      } finally {
        await db.execute(sql`drop trigger recusar_liberacao_mundo_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_liberacao_mundo_fixture()`);
      }
      // Only the synthetic worker retry is released; no consent/retention date changes.
      await db
        .update(operations)
        .set({ nextAttemptAt: sql`statement_timestamp()` })
        .where(eq(operations.id, op.operacaoId));
      expect(await f.liberar()).toMatchObject({ situacao: "mundo_liberado", quantidade: 1 });
      expect(await f.liberar()).toEqual({ situacao: "ociosa" });
      expect((await etapas()).map((m) => m.phase)).toEqual(["completed", "completed"]);
      expect(await f.concluir()).toMatchObject({
        situacao: "retirada_concluida",
        referenciasRetidas: 0,
      });
      expect(await db.select().from(members).where(eq(members.profileId, outro.id))).toEqual(
        membrosAntes,
      );
      for (const casa of casas)
        expect((await db.select().from(spaces).where(eq(spaces.id, casa.id)))[0]).toMatchObject({
          name: casa.name,
          status: casa.status,
          stewardProfileId: outro.id,
          createdByProfileId: outro.id,
          rightsOperationId: null,
          rightsFrozenState: null,
        });
    }));

  it("remove preferências e código agora, preservando apenas a referência do token até o prazo original", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        p = await jogador(a),
        outro = await jogador(b);
      await db.insert(preferences).values([
        { profileId: p.id, presenceMode: "invisible" },
        { profileId: outro.id, presenceMode: "online" },
      ]);
      await db.insert(codes).values({
        profileId: p.id,
        codeHash: "c".repeat(64),
        expiresAt: sql`clock_timestamp()+interval '10 minutes'`,
      });
      const [sessao] = await db
        .insert(gameSessions)
        .values({
          profileId: p.id,
          deviceSessionId: a.autor.sessaoDeAparelhoId,
          gameId: "morada",
          expiresAt: sql`clock_timestamp()+interval '1 hour'`,
        })
        .returning();
      if (!sessao) throw new Error("Synthetic retained session absent");
      const op = await f.admitir(a.autor, p.id);
      expect(await f.executar()).toMatchObject({
        situacao: "referencias_sociais_retiradas",
        dominio: "codigos_amizade",
        quantidade: 1,
      });
      expect(await f.executar()).toMatchObject({
        situacao: "referencias_sociais_retiradas",
        dominio: "preferencias_sociais",
        quantidade: 1,
      });
      expect(await f.executar()).toMatchObject({ situacao: "perfil_minimizado", retido: true });
      expect(await db.select().from(codes).where(eq(codes.profileId, p.id))).toEqual([]);
      expect(await db.select().from(preferences).where(eq(preferences.profileId, p.id))).toEqual(
        [],
      );
      expect(
        (await db.select().from(preferences).where(eq(preferences.profileId, outro.id)))[0],
      ).toMatchObject({ presenceMode: "online" });
      expect(
        (await db.select().from(subjects).where(eq(subjects.operationId, op.operacaoId)))[0],
      ).toMatchObject({ phase: "minimized", retainedUntil: sessao.expiresAt });
      expect(
        (await db.select().from(gameSessions).where(eq(gameSessions.id, sessao.id)))[0],
      ).toMatchObject({ expiresAt: sessao.expiresAt, endedAt: expect.any(Date) });
      expect(await f.expurgar()).toMatchObject({ situacao: "ociosa" });
      expect(await f.concluir()).toMatchObject({
        situacao: "retirada_concluida",
        referenciasRetidas: 1,
      });
    }));
  it("retira cadastro e seleção adulta, preservando o login da conta sem jogador", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        perfil = await jogador(a);
      await selecionarPerfil(a.autor, perfil.id);
      const op = await f.admitir(a.autor, perfil.id);
      expect(await f.executar()).toMatchObject({
        situacao: "perfil_minimizado",
        operacaoId: op.operacaoId,
        retido: false,
      });
      const [p] = await db.select().from(profiles).where(eq(profiles.id, perfil.id));
      expect(p).toMatchObject({
        userId: null,
        groupId: null,
        coverageEnabled: false,
        nickname: "Perfil retirado",
        avatar: "padrao",
        status: "suspended",
        rightsOperationId: op.operacaoId,
      });
      const [d] = await db.select().from(devices).where(eq(devices.id, a.autor.sessaoDeAparelhoId));
      expect(d?.activeProfileId).toBeNull();
      expect(d?.revokedAt).toBeNull();
      expect(await consultarMeusDireitos(a.autor)).toMatchObject({ perfis: [] });
      expect(
        (await db.select().from(subjects).where(eq(subjects.operationId, op.operacaoId)))[0]?.phase,
      ).toBe("purging");
      expect(await f.executar()).toEqual({ situacao: "ociosa" });
    }));

  it("remove nascimento e responsabilidade sem destravar o aparelho em contexto infantil", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        intencao = await prepararPerfilMenor(a.autor);
      const { perfil } = await cadastrarPerfilMenor(a.autor, {
        intencaoId: intencao.id,
        perfil: { apelido: "Criança privada", avatar: "padrao" },
        nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
        assumoResponsabilidade: true,
        versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
      });
      const loginInfantil = await loginReal(a.conta),
        ctx = await resolverAtor(loginInfantil);
      if (!ctx) throw new Error("Child context absent");
      await definirPinDaConta(a.autor, { pin: "593871" });
      await definirPinDoMenor(a.autor, { perfilId: perfil.id, pin: "396175" });
      await trocarPerfilComPin(ctx.ator, {
        destino: { tipo: "perfil", perfilId: perfil.id },
        pin: "396175",
      });
      const [antes] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, ctx.ator.sessaoDeAparelhoId));
      expect(antes?.minorContextGeneration).not.toBeNull();
      await f.admitir(a.autor, perfil.id);
      expect((await f.executar()).situacao).toBe("perfil_minimizado");
      expect((await db.select().from(minors).where(eq(minors.profileId, perfil.id))).length).toBe(
        0,
      );
      expect(
        (await db.select().from(guardians).where(eq(guardians.profileId, perfil.id))).length,
      ).toBe(0);
      const [depois] = await db
        .select()
        .from(devices)
        .where(eq(devices.id, ctx.ator.sessaoDeAparelhoId));
      expect(depois?.minorContextGeneration).toBe(antes?.minorContextGeneration);
      await expect(consultarMeusDireitos(ctx.ator)).rejects.toMatchObject({ code: "AUTH" });
    }));

  it("desvincula recibo composto de convite familiar antes de remover o login do perfil", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        perfil = await jogador(a);
      await db
        .insert(groups)
        .values({ ownerUserId: b.conta.id })
        .onConflictDoNothing({ target: groups.ownerUserId });
      const [grupo] = await db.select().from(groups).where(eq(groups.ownerUserId, b.conta.id));
      if (!grupo) throw new Error("Group absent");
      const agora = new Date(),
        criado = new Date(agora.getTime() - 1000);
      // Recibo sintético já aceito para qualificar a FK, não prova de aceite humano.
      const [convite] = await db
        .insert(groupInvites)
        .values({
          groupId: grupo.id,
          inviterUserId: b.conta.id,
          inviterDeclarationVersion: "adulto-2026-11-17",
          state: "accepted",
          createdAt: criado,
          expiresAt: new Date(agora.getTime() + 3600_000),
          finishedAt: agora,
          acceptedProfileId: perfil.id,
          acceptedUserId: a.conta.id,
          recipientDeclarationVersion: "adulto-2026-11-17",
          requestHash: "a".repeat(64),
        })
        .returning();
      if (!convite) throw new Error("Receipt absent");
      await f.admitir(a.autor, perfil.id);
      expect((await f.executar()).situacao).toBe("perfil_minimizado");
      const [preservado] = await db
        .select()
        .from(groupInvites)
        .where(eq(groupInvites.id, convite.id));
      expect(preservado).toMatchObject({
        state: "accepted",
        acceptedProfileId: null,
        acceptedUserId: null,
        recipientDeclarationVersion: convite.recipientDeclarationVersion,
        requestHash: convite.requestHash,
      });
    }));

  it("revoga convites antigos e conserva prazo técnico original de convite dirigido", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        perfil = await jogador(a),
        outro = await jogador(b);
      const [mundo] = await db
        .insert(spaces)
        .values({
          gameId: "morada",
          name: "Título pessoal",
          contentPolicy: "family",
          createdByProfileId: perfil.id,
          stewardProfileId: outro.id,
        })
        .returning();
      if (!mundo) throw new Error("World absent");
      const [autor] = await db
        .insert(members)
        .values({ spaceId: mundo.id, profileId: outro.id, role: "steward", state: "active" })
        .returning();
      if (!autor) throw new Error("Member absent");
      const agora = new Date(),
        fim = new Date(agora.getTime() + 3600_000),
        prazo = new Date(agora.getTime() + 30 * 86400_000);
      const [legado] = await db
        .insert(invites)
        .values({
          spaceId: mundo.id,
          invitedByMemberId: autor.id,
          form: "member",
          state: "sent",
          codeHash: "b".repeat(64),
          targetProfileId: perfil.id,
          participation: "Texto pessoal",
          expiresAt: fim,
        })
        .returning();
      const [convite] = await db
        .insert(directed)
        .values({
          spaceId: mundo.id,
          invitedByMemberId: autor.id,
          originProfileId: outro.id,
          targetProfileId: perfil.id,
          clientKey: randomUUID(),
          requestHash: "a".repeat(64),
          participation: "Texto pessoal",
          managementRevision: 1,
          friendshipRevision: 1,
          originPolicyVersion: outro.versaoDaPolitica,
          targetPolicyVersion: perfil.versaoDaPolitica,
          createdAt: agora,
          expiresAt: fim,
          retainUntil: prazo,
        })
        .returning();
      if (!legado || !convite) throw new Error("Invite absent");
      const op = await f.admitir(a.autor, perfil.id);
      expect(await f.executar()).toMatchObject({ situacao: "perfil_minimizado", retido: true });
      const [recibo] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.operacaoId));
      expect(recibo?.retainedUntil?.toISOString()).toBe(prazo.toISOString());
      expect(recibo?.phase).toBe("minimized");
      expect(await f.expurgar()).toEqual({ situacao: "ociosa" });
      expect((await db.select().from(spaces).where(eq(spaces.id, mundo.id)))[0]).toMatchObject({
        status: "archived",
        rightsOperationId: op.operacaoId,
      });
      expect(await f.liberar()).toMatchObject({ situacao: "mundo_liberado", quantidade: 1 });
      expect(await f.concluir()).toMatchObject({
        situacao: "retirada_concluida",
        referenciasRetidas: 1,
      });
      const [concluida] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, op.operacaoId));
      expect(concluida).toMatchObject({ state: "completed", leaseToken: null, leaseUntil: null });
      expect(concluida?.completedAt).toBeInstanceOf(Date);
      expect(await f.concluir()).toEqual({ situacao: "ociosa" });
      expect((await db.select().from(invites).where(eq(invites.id, legado.id)))[0]).toMatchObject({
        state: "revoked",
        participation: null,
      });
      expect(
        (await db.select().from(directed).where(eq(directed.id, convite.id)))[0],
      ).toMatchObject({ state: "revoked", participation: null, retainUntil: prazo });
      expect((await db.select().from(spaces).where(eq(spaces.id, mundo.id)))[0]).toMatchObject({
        name: "Mundo preservado",
        createdByProfileId: null,
        stewardProfileId: outro.id,
        status: "hibernating",
        rightsOperationId: null,
      });
    }));

  it("histórico de membro que já saiu não força transferência impossível nem muda sua saída", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        perfil = await jogador(a),
        outro = await jogador(b);
      const [mundo] = await db
        .insert(spaces)
        .values({
          gameId: "morada",
          name: "Mundo antigo",
          contentPolicy: "family",
          createdByProfileId: perfil.id,
          stewardProfileId: perfil.id,
        })
        .returning();
      if (!mundo) throw new Error("World absent");
      await db
        .insert(members)
        .values({ spaceId: mundo.id, profileId: perfil.id, role: "steward", state: "active" });
      const saiu = new Date(Date.now() - 10_000);
      const [antigo] = await db
        .insert(members)
        .values({
          spaceId: mundo.id,
          profileId: outro.id,
          role: "member",
          state: "former",
          joinedAt: new Date(saiu.getTime() - 10_000),
          leftAt: saiu,
        })
        .returning();
      if (!antigo) throw new Error("Former member absent");
      await f.admitir(a.autor, perfil.id);
      expect((await f.executar()).situacao).toBe("perfil_minimizado");
      expect(await f.liberar()).toMatchObject({ situacao: "mundo_liberado", quantidade: 1 });
      expect((await db.select().from(members).where(eq(members.id, antigo.id)))[0]?.leftAt).toEqual(
        saiu,
      );
    }));

  it("auditoria recusada conserva cadastro, responsabilidade e barreiras", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        perfil = await jogador(a);
      await f.admitir(a.autor, perfil.id);
      await db.execute(
        sql`create function audit.recusar_minimizacao_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_profile_minimized' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_minimizacao_fixture before insert on audit.events for each row execute function audit.recusar_minimizacao_fixture()`,
      );
      try {
        await expect(f.executar()).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_minimizacao_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_minimizacao_fixture()`);
      }
      expect((await db.select().from(profiles).where(eq(profiles.id, perfil.id)))[0]).toMatchObject(
        { userId: a.conta.id, nickname: perfil.apelido, status: "suspended" },
      );
    }));
  it("remove fisicamente só o perfil selecionado e conclui uma única vez", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        p = await jogador(a),
        outro = await jogador(b);
      const op = await f.admitir(a.autor, p.id);
      expect(await f.concluir()).toEqual({ situacao: "ociosa" });
      await f.executar();
      expect(await f.concluir()).toEqual({ situacao: "ociosa" });
      expect(await f.expurgar()).toMatchObject({
        situacao: "perfil_removido",
        operacaoId: op.operacaoId,
      });
      expect(await db.select().from(profiles).where(eq(profiles.id, p.id))).toHaveLength(0);
      expect((await db.select().from(profiles).where(eq(profiles.id, outro.id)))[0]?.nickname).toBe(
        "Pessoa privada",
      );
      const [recibo] = await db
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.operacaoId));
      expect(recibo).toMatchObject({ phase: "removed", liveProfileId: null, retainedUntil: null });
      expect(recibo?.completedAt).toBeInstanceOf(Date);
      expect(await f.concluir()).toMatchObject({
        situacao: "retirada_concluida",
        referenciasRetidas: 0,
      });
      expect(await f.concluir()).toEqual({ situacao: "ociosa" });
      expect(await f.expurgar()).toEqual({ situacao: "ociosa" });
      expect(await consultarMeusDireitos(a.autor)).toMatchObject({ perfis: [] });
    }));

  it("retira códigos antes de minimizar em lotes de cem, preservando outro perfil", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        p = await jogador(a),
        outro = await jogador(b);
      const agora = new Date(),
        criado = new Date(agora.getTime() - 3600_000),
        vence = new Date(criado.getTime() + 1200_000);
      await db.insert(codes).values(
        Array.from({ length: 103 }, () => ({
          profileId: p.id,
          codeHash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
          createdAt: criado,
          expiresAt: vence,
          revokedAt: agora,
        })),
      );
      await db.insert(codes).values({
        profileId: outro.id,
        codeHash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
        createdAt: criado,
        expiresAt: vence,
      });
      await f.admitir(a.autor, p.id);
      expect(await f.executar()).toMatchObject({
        situacao: "referencias_sociais_retiradas",
        dominio: "codigos_amizade",
        quantidade: 100,
      });
      expect(await db.select().from(codes).where(eq(codes.profileId, p.id))).toHaveLength(3);
      expect(await f.executar()).toMatchObject({
        situacao: "referencias_sociais_retiradas",
        quantidade: 3,
      });
      expect(await f.executar()).toMatchObject({ situacao: "perfil_minimizado" });
      expect(await f.expurgar()).toMatchObject({ situacao: "perfil_removido" });
      expect(await db.select().from(codes).where(eq(codes.profileId, outro.id))).toHaveLength(1);
    }));

  it("auditoria recusada reverte o DELETE e o recibo removed juntos", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        p = await jogador(a),
        op = await f.admitir(a.autor, p.id);
      await f.executar();
      await db.execute(
        sql`create function audit.recusar_expurgo_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_profile_removed' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_expurgo_teste before insert on audit.events for each row execute function audit.recusar_expurgo_teste()`,
      );
      try {
        await expect(f.expurgar()).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_expurgo_teste on audit.events`);
        await db.execute(sql`drop function audit.recusar_expurgo_teste()`);
      }
      expect(await db.select().from(profiles).where(eq(profiles.id, p.id))).toHaveLength(1);
      expect(
        (await db.select().from(subjects).where(eq(subjects.operationId, op.operacaoId)))[0],
      ).toMatchObject({ phase: "purging", liveProfileId: p.id, completedAt: null });
    }));

  it("intenção alterada não autoriza expurgo e não monopoliza a próxima operação", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        p = await jogador(a),
        outro = await jogador(b);
      const op = await f.admitir(a.autor, p.id);
      await f.executar();
      await db.execute(
        sql`update recreio.rights_operations set signed_intent=set_byte(signed_intent,0,0) where id=${op.operacaoId}::uuid`,
      );
      await expect(f.expurgar()).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      expect(await db.select().from(profiles).where(eq(profiles.id, p.id))).toHaveLength(1);
      await f.admitir(b.autor, outro.id);
      await f.executar();
      expect(await f.expurgar()).toMatchObject({ situacao: "perfil_removido" });
    }));

  it(
    "conserva a referência até vencer o token original e expurga após concluir",
    async () =>
      cenario(async (f) => {
        const a = await adulto(),
          p = await jogador(a);
        // SID sintético sem mundo para qualificar o prazo técnico real, não o
        // transporte de um jogo. O consentimento o encerra pelo cursor nativo.
        await db.insert(gameSessions).values({
          profileId: p.id,
          deviceSessionId: a.autor.sessaoDeAparelhoId,
          gameId: "morada",
          expiresAt: sql`clock_timestamp()+interval '10 seconds'`,
        });
        const op = await f.admitir(a.autor, p.id);
        await f.executar();
        const [recibo] = await db
          .select()
          .from(subjects)
          .where(eq(subjects.operationId, op.operacaoId));
        expect(recibo?.phase).toBe("minimized");
        expect(await f.expurgar()).toEqual({ situacao: "ociosa" });
        expect(await f.concluir()).toMatchObject({
          situacao: "retirada_concluida",
          referenciasRetidas: 1,
        });
        const [antes] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
        // O relógio anda de verdade no runner; nenhum prazo de trinta dias é
        // falsificado nem a data de conclusão é reescrita para provar este caso.
        await expect
          .poll(() => f.expurgar(), { timeout: 15000, interval: 100 })
          .toMatchObject({
            situacao: "referencias_expurgadas",
            dominio: "sessoes_jogo",
            quantidade: 1,
          });
        expect(await f.expurgar()).toMatchObject({ situacao: "perfil_removido" });
        const [depois] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
        expect(depois).toMatchObject({
          state: "completed",
          leaseToken: null,
          leaseUntil: null,
          completedAt: antes?.completedAt,
        });
        expect(
          (await db.select().from(subjects).where(eq(subjects.operationId, op.operacaoId)))[0],
        ).toMatchObject({
          phase: "removed",
          liveProfileId: null,
          retainedUntil: recibo?.retainedUntil,
        });
      }),
    20000,
  );
  it("executor composto percorre a fila real sem publicar conteúdo ou dados pessoais", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        p = await jogador(a),
        op = await f.admitir(a.autor, p.id);
      const resultado = await f.rodada();
      expect(resultado.etapas).toContainEqual({
        etapa: "conclusao",
        situacao: "retirada_concluida",
      });
      for (const privado of [p.id, a.conta.id, a.conta.email, "Pessoa privada", op.operacaoId])
        expect(JSON.stringify(resultado)).not.toContain(privado);
      expect(
        (await db.select().from(operations).where(eq(operations.id, op.operacaoId)))[0]?.state,
      ).toBe("completed");
      expect(await db.select().from(profiles).where(eq(profiles.id, p.id))).toHaveLength(0);
    }));
  it("rodada falha mesmo ociosa se uma operação anterior exige revisão", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        p = await jogador(a),
        op = await f.admitir(a.autor, p.id);
      await db
        .update(operations)
        .set({ state: "review", reviewCode: "integrity" })
        .where(eq(operations.id, op.operacaoId));
      await expect(f.rodada()).rejects.toBeInstanceOf(AggregateError);
      expect(await db.select().from(profiles).where(eq(profiles.id, p.id))).toHaveLength(1);
    }));
  it("publicador preserva a seleção externa original antes dos efeitos nativos", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        p = await jogador(a),
        op = await f.admitir(a.autor, p.id);
      const [linha] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
      if (!linha) throw new Error("Operation absent");
      const plano = await f.storage.lerPlano(linha.planSha256);
      expect(plano).toMatchObject({
        tipo: "retirar_perfil",
        contaId: a.conta.id,
        perfis: [{ id: p.id, tipo: "adult", versao: p.versaoDaPolitica }],
        mundos: [],
      });
      expect(JSON.stringify(plano)).not.toContain(a.conta.email);
      expect(JSON.stringify(plano)).not.toContain("Pessoa privada");
      expect((await db.select().from(profiles).where(eq(profiles.id, p.id)))[0]?.userId).toBe(
        a.conta.id,
      );
    }));
  it("barreira e recibo locais não ampliam os mundos do plano assinado", async () =>
    cenario(async (f) => {
      const a = await adulto(),
        b = await adulto(),
        p = await jogador(a),
        outro = await jogador(b),
        op = await f.admitir(a.autor, p.id);
      const [mundo] = await db
        .insert(spaces)
        .values({
          gameId: "morada",
          name: "Mundo de outra pessoa",
          contentPolicy: "family",
          createdByProfileId: outro.id,
          stewardProfileId: outro.id,
        })
        .returning();
      if (!mundo) throw new Error("World absent");
      // Corrupção local coerente com os CHECKs, posterior ao consentimento.
      // O escopo externo original está vazio e não autoriza este mundo.
      await db.insert(worlds).values({
        operationId: op.operacaoId,
        spaceId: mundo.id,
        sourceStatus: "hibernating",
        sourceRevision: 0,
        sourceJournalSeq: 0,
        sourceLeaseEpoch: mundo.leaseEpoch,
        sourceManagementRevision: mundo.managementRevision,
        snapshotCursor: 0,
        phase: "dependencies",
      });
      const cerca = sql`${spaces.leaseEpoch}+1`,
        gestao = sql`${spaces.managementRevision}+1`;
      await db
        .update(spaces)
        .set({
          status: "archived",
          leaseEpoch: cerca,
          managementRevision: gestao,
          rightsOperationId: op.operacaoId,
          rightsFrozenState: recreioRightsWorldProjection({
            ...spaces,
            status: sql`'archived'`,
            leaseEpoch: cerca,
            managementRevision: gestao,
          }),
        })
        .where(eq(spaces.id, mundo.id));
      expect(await f.executar()).toMatchObject({ situacao: "revisao" });
      expect((await db.select().from(profiles).where(eq(profiles.id, p.id)))[0]).toMatchObject({
        userId: a.conta.id,
        nickname: "Pessoa privada",
      });
      expect((await db.select().from(spaces).where(eq(spaces.id, mundo.id)))[0]).toMatchObject({
        rightsOperationId: op.operacaoId,
        name: mundo.name,
      });
      expect(
        (await db.select().from(operations).where(eq(operations.id, op.operacaoId)))[0],
      ).toMatchObject({ state: "review", reviewCode: "integrity" });
    }));
});
