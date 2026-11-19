import { randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioProfiles as profiles,
  recreioPurchaseAuthorizations as purchases,
  sessions,
  recreioRightsSubjects as subjects,
  users,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { consultarMinhaParticipacaoNoRecreio } from "@/features/account/participacao-service";
import { VERSAO_DA_COMPRA } from "@/features/cobranca/constantes";
import { AceiteDaCompraSchema } from "@/features/cobranca/regras";
import { prepararCompraNoBanco } from "@/features/cobranca/repository";
import { reservarFotografiaDeDireitos } from "@/features/direitos/fotografias-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import {
  prepararDireitosNoBanco,
  prepararEncerramentoNoBanco,
} from "@/features/direitos/preparacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import {
  consentirEncerramentoNoBanco,
  consentirRetiradaNoBanco,
} from "@/features/direitos/retirada-consentimento-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { codigoDoBanco, eventosCom, loginReal, novaConta } from "./apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";

async function fixture(comPerfil = false) {
  const conta = await novaConta(),
    login = await loginReal(conta),
    contexto = await resolverAtor(login);
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, login.authSessionId));
  if (!contexto || !sessao) throw new Error("Native closure fixture absent");
  const autor: AutorNativoRecente = {
    ...contexto.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const perfil = comPerfil
    ? (await criarPerfilProprio(autor, { apelido: "Pessoa privada", avatar: "padrao" })).perfil
    : null;
  const assinatura = criarAssinaturaDoLivro({
    livroId: randomUUID(),
    chaveAtiva: "fixture",
    chaves: new Map([["fixture", randomBytes(32)]]),
  });
  const config = { assinatura, fonte: "a".repeat(40), epoca: 0, modo: "dev" as const };
  const preparar = () =>
    prepararEncerramentoNoBanco(
      autor,
      { pedidoId: randomUUID(), tipo: "encerrar_conta", perfis: perfil ? [perfil.id] : [] },
      "dev",
    );
  const pedido = (previa: { preparacaoId: string; planoSha256: string }) => ({
    preparacaoId: previa.preparacaoId,
    planoSha256: previa.planoSha256,
    confirmoEncerramento: true,
    confirmoRetiradaDosPerfis: true,
    confirmoCancelamentoDaRenovacao: true,
  });
  return {
    conta,
    autor,
    perfil,
    config,
    preparar,
    pedido,
    confirmar: (previa: Parameters<typeof pedido>[0]) =>
      consentirEncerramentoNoBanco(autor, pedido(previa), config),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cenario(comPerfil: boolean, executar: (f: Fixture) => Promise<void>) {
  const f = await fixture(comPerfil);
  try {
    await executar(f);
  } finally {
    f.config.assinatura.encerrar();
  }
}
async function compraNaoEnviada(f: Fixture) {
  const inventario = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, f.conta.id))
    .orderBy(profiles.id);
  return prepararCompraNoBanco(
    f.autor,
    AceiteDaCompraSchema.parse({
      pedidoId: randomUUID(),
      produtoId: "recreio_individual_monthly",
      valorCentavos: 5990,
      moeda: "BRL",
      intervalo: "month",
      souAdulto: true,
      aceitoCobrancaRecorrente: true,
      versaoDasCondicoes: VERSAO_DA_COMPRA,
      versaoDaDeclaracao: VERSAO_DA_DECLARACAO_ADULTA,
      perfis: inventario.map((p) => ({ perfilId: p.id, versao: p.policyVersion, cobrir: false })),
    }),
    "dev",
  );
}

describe("encerramento: consentimento v2 e congelamento atômico, ainda sem conclusão", () => {
  it("publicação no livro não admite retirada genérica nem coloca encerramento financeiro pendente em revisão", () =>
    cenario(true, async (f) => {
      const http = await criarBucketDoLivro();
      try {
        const storage = criarArmazenamentoDoLivro({
          cliente: http.cliente,
          bucket: "recreio-fixture",
          assinatura: f.config.assinatura,
          tempoLimiteMs: 2000,
        });
        await storage.iniciarCabecalho(
          f.config.assinatura.assinarCabecalho({
            formato: "recreio-livro-direitos-v1",
            estado: "aberto",
            epoca: 0,
            chavesUtilizadas: [f.config.assinatura.chaveAtiva],
            retomada: null,
            livroId: f.config.assinatura.livroId,
            geracao: 0,
            entradas: 0,
            raizSha256: RAIZ_VAZIA,
            anteriorSha256: null,
            ultimaIntencao: null,
            atualizadoEm: new Date().toISOString(),
          }),
        );
        const recibo = await f.confirmar(await f.preparar());
        expect(
          await publicarProximoConsentimento({ assinatura: f.config.assinatura, storage }),
        ).toMatchObject({ situacao: "admitida", operacaoId: recibo.operacaoId });
        const config = {
          assinatura: f.config.assinatura,
          prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 5000 }),
        };
        expect(await minimizarProximoPerfil(config)).toMatchObject({ situacao: "ociosa" });
        expect(await reservarFotografiaDeDireitos(config)).toBeNull();
        expect(
          (await db.select().from(operations).where(eq(operations.id, recibo.operacaoId)))[0],
        ).toMatchObject({ state: "admitted", reviewCode: null });
        expect(
          (await db.select().from(finances).where(eq(finances.operationId, recibo.operacaoId)))[0],
        ).toMatchObject({ state: "pending", confirmedAt: null });
      } finally {
        await http.fechar();
      }
    }));
  it("conta sem jogador registra outbox, barreira e recibo financeiro sem criar perfil", () =>
    cenario(false, async (f) => {
      const previa = await f.preparar(),
        recibo = await f.confirmar(previa);
      expect(recibo.estado).toBe("publishing");
      expect(await consultarMinhaParticipacaoNoRecreio(f.autor)).toMatchObject({
        estado: "closing",
        revisao: 2,
      });
      expect(
        (await db.select().from(participations).where(eq(participations.userId, f.conta.id)))[0],
      ).toMatchObject({ operationId: recibo.operacaoId });
      expect(await db.select().from(profiles).where(eq(profiles.userId, f.conta.id))).toEqual([]);
      expect(
        await db.select().from(subjects).where(eq(subjects.operationId, recibo.operacaoId)),
      ).toEqual([]);
      expect(
        (await db.select().from(finances).where(eq(finances.operationId, recibo.operacaoId)))[0],
      ).toMatchObject({
        requesterUserId: f.conta.id,
        customerId: null,
        providerCustomerId: null,
        state: "pending",
        attempts: 0,
        requestStartedAt: null,
        confirmedAt: null,
      });
      expect((await db.select().from(users).where(eq(users.id, f.conta.id)))[0]).toBeDefined();
      expect(
        (await db.select().from(sessions).where(eq(sessions.id, f.autor.login.authSessionId)))[0],
      ).toBeDefined();
      await expect(
        criarPerfilProprio(f.autor, { apelido: "Novo", avatar: "padrao" }),
      ).rejects.toMatchObject({ code: "PARTICIPACAO_ENCERRADA" });
    }));

  it("congela perfil e encerra somente compra nunca enviada; replay conserva o aceite original", () =>
    cenario(true, async (f) => {
      if (!f.perfil) throw new Error("Own profile absent");
      const compra = await compraNaoEnviada(f),
        previa = await f.preparar(),
        recibo = await f.confirmar(previa);
      const [original] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, recibo.operacaoId));
      expect(original).toMatchObject({
        kind: "encerrar_conta",
        source: f.config.fonte,
        state: "publishing",
      });
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, f.perfil.id)))[0],
      ).toMatchObject({ status: "suspended", rightsOperationId: recibo.operacaoId });
      expect(
        (await db.select().from(purchases).where(eq(purchases.id, compra.id)))[0],
      ).toMatchObject({
        resolution: "not_started",
        requestStartedAt: null,
        providerSessionId: null,
      });
      expect(
        (await db.select().from(devices).where(eq(devices.id, f.autor.sessaoDeAparelhoId)))[0],
      ).toMatchObject({ activeProfileId: null, minorContextGeneration: null, revokedAt: null });
      expect(
        await consentirEncerramentoNoBanco(f.autor, f.pedido(previa), {
          ...f.config,
          fonte: "b".repeat(40),
        }),
      ).toEqual(recibo);
      expect(
        (await db.select().from(operations).where(eq(operations.id, recibo.operacaoId)))[0],
      ).toEqual(original);
      expect(
        (await eventosCom("operationId", recibo.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_participation_closing",
        ),
      ).toHaveLength(1);
      await expect(
        consentirRetiradaNoBanco(
          f.autor,
          {
            preparacaoId: previa.preparacaoId,
            planoSha256: previa.planoSha256,
            confirmoRetirada: true,
          },
          f.config,
        ),
      ).rejects.toMatchObject({ code: "DIREITOS" });
    }));

  it("recusa plano legado e exige os três aceites sem mudar a participação", () =>
    cenario(false, async (f) => {
      const legado = await prepararDireitosNoBanco(f.autor, {
        pedidoId: randomUUID(),
        tipo: "encerrar_conta",
        perfis: [],
      });
      await expect(f.confirmar(legado)).rejects.toMatchObject({ code: "ESCOPO" });
      const previa = await f.preparar();
      for (const campo of [
        "confirmoEncerramento",
        "confirmoRetiradaDosPerfis",
        "confirmoCancelamentoDaRenovacao",
      ])
        expect(() =>
          consentirEncerramentoNoBanco(f.autor, { ...f.pedido(previa), [campo]: false }, f.config),
        ).toThrow();
      expect(await consultarMinhaParticipacaoNoRecreio(f.autor)).toMatchObject({
        estado: "active",
        revisao: 0,
      });
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.conta.id)),
      ).toEqual([]);
    }));

  it("recusa outro adulto, contexto infantil e login antigo sem registrar efeito", () =>
    cenario(false, async (f) => {
      const previa = await f.preparar(),
        outro = await fixture();
      try {
        await expect(
          consentirEncerramentoNoBanco(outro.autor, f.pedido(previa), outro.config),
        ).rejects.toMatchObject({ code: "DIREITOS" });
      } finally {
        outro.config.assinatura.encerrar();
      }
      await db
        .update(devices)
        .set({ minorContextGeneration: randomUUID() })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await expect(f.confirmar(previa)).rejects.toMatchObject({ code: "AUTH" });
      await db
        .update(devices)
        .set({ minorContextGeneration: null })
        .where(eq(devices.id, f.autor.sessaoDeAparelhoId));
      await expect(
        consentirEncerramentoNoBanco(
          { ...f.autor, login: { ...f.autor.login, criadoEm: new Date(Date.now() - 11 * 60_000) } },
          f.pedido(previa),
          f.config,
        ),
      ).rejects.toMatchObject({ code: "LOGIN_RECENTE" });
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.conta.id)),
      ).toEqual([]);
    }));

  it("auditoria indisponível reverte perfil, compra, barreira, outbox e fila financeira", () =>
    cenario(true, async (f) => {
      if (!f.perfil) throw new Error("Own profile absent");
      const compra = await compraNaoEnviada(f),
        previa = await f.preparar();
      await db.execute(
        sql`create function audit.recusar_encerramento_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.account_participation_closing' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_encerramento_teste before insert on audit.events for each row execute function audit.recusar_encerramento_teste()`,
      );
      try {
        await expect(f.confirmar(previa)).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_encerramento_teste on audit.events`);
        await db.execute(sql`drop function audit.recusar_encerramento_teste()`);
      }
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.conta.id)),
      ).toEqual([]);
      expect(
        await db.select().from(participations).where(eq(participations.userId, f.conta.id)),
      ).toEqual([]);
      expect(
        await db.select().from(finances).where(eq(finances.requesterUserId, f.conta.id)),
      ).toEqual([]);
      expect(
        (await db.select().from(purchases).where(eq(purchases.id, compra.id)))[0],
      ).toMatchObject({ resolvedAt: null });
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, f.perfil.id)))[0],
      ).toMatchObject({ rightsOperationId: null, status: "active" });
      expect((await f.confirmar(previa)).estado).toBe("publishing");
    }));

  it("duas prévias concorrentes encerram a mesma participação só uma vez", () =>
    cenario(false, async (f) => {
      const [a, b] = await Promise.all([f.preparar(), f.preparar()]);
      const results = await Promise.allSettled([f.confirmar(a), f.confirmar(b)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        await db.select().from(operations).where(eq(operations.requesterUserId, f.conta.id)),
      ).toHaveLength(1);
      expect(
        await db.select().from(finances).where(eq(finances.requesterUserId, f.conta.id)),
      ).toHaveLength(1);
    }));

  it("PostgreSQL recusa contador sem tentativa, confirmação parcial, outro solicitante e datas infinitas", () =>
    cenario(false, async (f) => {
      const recibo = await f.confirmar(await f.preparar());
      expect(
        await codigoDoBanco(
          db
            .update(finances)
            .set({ attempts: 1 })
            .where(eq(finances.operationId, recibo.operacaoId)),
        ),
      ).toBe("23514");
      expect(
        await codigoDoBanco(
          db
            .update(finances)
            .set({ state: "confirmed" })
            .where(eq(finances.operationId, recibo.operacaoId)),
        ),
      ).toBe("23514");
      expect(
        await codigoDoBanco(
          db
            .update(finances)
            .set({ requesterUserId: randomUUID() })
            .where(eq(finances.operationId, recibo.operacaoId)),
        ),
      ).toBe("23503");
      expect(
        await codigoDoBanco(
          db
            .update(participations)
            .set({ updatedAt: sql`'infinity'::timestamptz` })
            .where(eq(participations.userId, f.conta.id)),
        ),
      ).toBe("23514");
      expect(
        await codigoDoBanco(
          db
            .update(finances)
            .set({ nextAttemptAt: sql`'infinity'::timestamptz` })
            .where(eq(finances.operationId, recibo.operacaoId)),
        ),
      ).toBe("23514");
    }));
});
