import { randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioDirectedSpaceInvites as directed,
  recreioGroupInvites as groupInvites,
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  sessions,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
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
});
