import { randomBytes, randomUUID } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  events as auditEvents,
  recreioSpaceMembers as members,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  sessions,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { admitirIntencaoNoLivro } from "@/features/direitos/livro/publicacao";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirRetiradaNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import {
  cancelarPreviaDeDireitos,
  consultarMeusDireitos,
  prepararPedidoDeDireitos,
} from "@/features/direitos/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { eventosCom, loginReal, novaConta } from "./apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";

async function adulto() {
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
    apelido: "Pessoa privada",
    avatar: "padrao",
  });
  return { conta, autor, perfil };
}
async function cenario(fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const f = await preparar();
  try {
    await fn(f);
  } finally {
    f.config.assinatura.encerrar();
  }
}
async function preparar() {
  const a = await adulto();
  const config = {
    assinatura: criarAssinaturaDoLivro({
      livroId: randomUUID(),
      chaveAtiva: "fixture",
      chaves: new Map([["fixture", randomBytes(32)]]),
    }),
    fonte: "a".repeat(40),
    epoca: 0,
  };
  const previa = () =>
    prepararPedidoDeDireitos(a.autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [a.perfil.id],
    });
  const confirmar = (ref: { preparacaoId: string; planoSha256: string }) =>
    consentirRetiradaNoBanco(
      a.autor,
      { preparacaoId: ref.preparacaoId, planoSha256: ref.planoSha256, confirmoRetirada: true },
      config,
    );
  const mundo = async (opcoes: { status?: "active" | "hibernating"; diario?: number } = {}) => {
    const [m] = await db
      .insert(spaces)
      .values({
        name: "Casa privada",
        gameId: "morada",
        contentPolicy: "family",
        stewardProfileId: a.perfil.id,
        createdByProfileId: a.perfil.id,
        status: opcoes.status ?? "hibernating",
        journalSeq: opcoes.diario ?? 0,
      })
      .returning();
    if (!m) throw new Error("World absent");
    return m;
  };
  return { ...a, config, previa, confirmar, mundo };
}

describe("consentimento nativo e outbox de retirada", () => {
  it("resposta perdida devolve a mesma operação e os bytes exatos, sem nova versão ou auditoria", async () =>
    cenario(async (f) => {
      const p = await f.previa(),
        um = await f.confirmar(p);
      const [antes] = await db.select().from(operations).where(eq(operations.id, um.operacaoId));
      expect(await f.confirmar(p)).toEqual(um);
      const [depois] = await db.select().from(operations).where(eq(operations.id, um.operacaoId));
      expect(depois?.signedIntent).toEqual(antes?.signedIntent);
      const [perfil] = await db.select().from(profiles).where(eq(profiles.id, f.perfil.id));
      expect(perfil?.policyVersion).toBe(f.perfil.versaoDaPolitica + 1);
      expect(perfil?.status).toBe("suspended");
      expect(perfil?.rightsOperationId).toBe(um.operacaoId);
      expect(
        (await eventosCom("operationId", um.operacaoId)).filter(
          (e) => e.eventType === "recreio.rights_consented",
        ),
      ).toHaveLength(1);
      expect(
        (await db.select().from(subjects).where(eq(subjects.operationId, um.operacaoId))).length,
      ).toBe(1);
      await expect(
        cancelarPreviaDeDireitos(f.autor, {
          preparacaoId: p.preparacaoId,
          planoSha256: p.planoSha256,
        }),
      ).rejects.toMatchObject({ code: "CONSENTIMENTO" });
    }));
  it("não aceita conta alheia, confirmação implícita ou metadados extras da prévia", async () =>
    cenario(async (f) => {
      const p = await f.previa(),
        outra = await adulto();
      await expect(
        consentirRetiradaNoBanco(
          outra.autor,
          { preparacaoId: p.preparacaoId, planoSha256: p.planoSha256, confirmoRetirada: true },
          f.config,
        ),
      ).rejects.toMatchObject({ code: "DIREITOS" });
      expect(() =>
        consentirRetiradaNoBanco(
          f.autor,
          { preparacaoId: p.preparacaoId, planoSha256: p.planoSha256 },
          f.config,
        ),
      ).toThrow();
      expect(() =>
        consentirRetiradaNoBanco(f.autor, { ...p, confirmoRetirada: true }, f.config),
      ).toThrow();
      expect(
        (await db.select().from(operations).where(eq(operations.preparationId, p.preparacaoId)))
          .length,
      ).toBe(0);
    }));
  it("prévia cancelada e autoridade alterada não congelam o perfil", async () =>
    cenario(async (f) => {
      const p = await f.previa();
      await cancelarPreviaDeDireitos(f.autor, {
        preparacaoId: p.preparacaoId,
        planoSha256: p.planoSha256,
      });
      await expect(f.confirmar(p)).rejects.toMatchObject({ code: "DIREITOS" });
      const nova = await f.previa();
      await db
        .update(profiles)
        .set({ policyVersion: sql`${profiles.policyVersion}+1` })
        .where(eq(profiles.id, f.perfil.id));
      await expect(f.confirmar(nova)).rejects.toMatchObject({ code: "ESCOPO" });
      const [perfil] = await db.select().from(profiles).where(eq(profiles.id, f.perfil.id));
      expect(perfil?.rightsOperationId).toBeNull();
    }));
  it("mundo descoberto depois da prévia exige outra seleção, sem travá-lo tardiamente", async () =>
    cenario(async (f) => {
      const p = await f.previa(),
        mundo = await f.mundo();
      await expect(f.confirmar(p)).rejects.toMatchObject({ code: "ESCOPO" });
      const [m] = await db.select().from(spaces).where(eq(spaces.id, mundo.id));
      expect(m?.rightsOperationId).toBeNull();
    }));
  it("admite drenagem sem alterar o diário ou fingir foto confirmada", async () => {
    for (const ativo of [true, false])
      await cenario(async (f) => {
        const mundo = await f.mundo({
          status: ativo ? "active" : "hibernating",
          diario: ativo ? 0 : 1,
        });
        const op = await f.confirmar(await f.previa());
        const [m] = await db.select().from(spaces).where(eq(spaces.id, mundo.id));
        expect(m).toMatchObject({
          status: "archived",
          rightsDraining: true,
          rightsOperationId: op.operacaoId,
          journalSeq: mundo.journalSeq,
          revision: mundo.revision,
          leaseEpoch: mundo.leaseEpoch,
          name: mundo.name,
        });
        expect(
          (await db.select().from(worlds).where(eq(worlds.operationId, op.operacaoId)))[0],
        ).toMatchObject({
          phase: "draining",
          snapshotCursor: 0,
          sourceJournalSeq: mundo.journalSeq,
        });
      });
  });
  it("responsável por mundo de outro participante precisa transferir a gestão antes", async () =>
    cenario(async (f) => {
      const mundo = await f.mundo(),
        outro = await adulto();
      await db
        .insert(members)
        .values({ spaceId: mundo.id, profileId: outro.perfil.id, role: "member", state: "active" });
      await expect(f.confirmar(await f.previa())).rejects.toMatchObject({
        code: "RESPONSABILIDADE",
      });
    }));
  it("congela mundo consistente com cerca nova e recibo histórico, sem apagar ou reescrever fotos", async () =>
    cenario(async (f) => {
      const mundo = await f.mundo(),
        op = await f.confirmar(await f.previa());
      const [m] = await db.select().from(spaces).where(eq(spaces.id, mundo.id));
      expect(m?.rightsOperationId).toBe(op.operacaoId);
      expect(m?.status).toBe("archived");
      expect(m?.leaseEpoch).toBe(mundo.leaseEpoch + 1);
      expect(m?.name).toBe(mundo.name);
      const [recibo] = await db.select().from(worlds).where(eq(worlds.operationId, op.operacaoId));
      expect(recibo?.sourceLeaseEpoch).toBe(mundo.leaseEpoch);
      expect(recibo?.phase).toBe("frozen");
    }));
  it("auditoria recusada reverte intenção, suspensão e barreiras na mesma transação", async () =>
    cenario(async (f) => {
      const p = await f.previa();
      await db.execute(
        sql`create function audit.recusar_consentimento_fixture() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.rights_consented' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_consentimento_fixture before insert on audit.events for each row execute function audit.recusar_consentimento_fixture()`,
      );
      try {
        await expect(f.confirmar(p)).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_consentimento_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_consentimento_fixture()`);
      }
      expect(
        (await db.select().from(operations).where(eq(operations.preparationId, p.preparacaoId)))
          .length,
      ).toBe(0);
      const [perfil] = await db.select().from(profiles).where(eq(profiles.id, f.perfil.id));
      expect(perfil?.status).toBe("active");
      expect(perfil?.rightsOperationId).toBeNull();
    }));
});

describe("outbox nativa com SDK S3 HTTP e PostgreSQL reais", () => {
  it("confirma pela composição servidora e acompanha o mesmo pedido sem mostrar cancelamento", async () => {
    const livro = fixtureDoLivro(),
      http = await criarBucketDoLivro();
    try {
      const storage = criarArmazenamentoDoLivro({
        cliente: http.cliente,
        bucket: "recreio-fixture",
        assinatura: livro.assinatura,
        tempoLimiteMs: 2000,
      });
      await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
      const a = await adulto(),
        outra = await adulto();
      const previa = await prepararPedidoDeDireitos(a.autor, {
        pedidoId: randomUUID(),
        tipo: "retirar_perfil",
        perfis: [a.perfil.id],
      });
      const pedido = {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoRetirada: true,
      };
      const config = { assinatura: livro.assinatura, storage, fonte: "a".repeat(40) };
      await expect(confirmarRetiradaDePerfil(outra.autor, pedido, config)).rejects.toMatchObject({
        code: "DIREITOS",
      });
      const recibo = await confirmarRetiradaDePerfil(a.autor, pedido, config);
      expect(await confirmarRetiradaDePerfil(a.autor, pedido, config)).toEqual(recibo);
      const painel = await consultarMeusDireitos(a.autor);
      expect(
        painel.preparacoes.find((p) => p.preparacaoId === previa.preparacaoId)?.operacao,
      ).toMatchObject({
        estado: "publishing",
        consentidaEm: recibo.consentidaEm,
        concluidaEm: null,
      });
      expect(JSON.stringify((await consultarMeusDireitos(outra.autor)).preparacoes)).not.toContain(
        recibo.operacaoId,
      );
      await expect(cancelarPreviaDeDireitos(a.autor, pedido)).rejects.toMatchObject({
        name: "ZodError",
      });
      await expect(
        cancelarPreviaDeDireitos(a.autor, {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
        }),
      ).rejects.toMatchObject({ code: "CONSENTIMENTO" });
    } finally {
      livro.encerrar();
      await http.fechar();
    }
  });
  it("livro ausente ou congelado impede consentimento sem bloquear o perfil", async () => {
    const livro = fixtureDoLivro(),
      http = await criarBucketDoLivro();
    try {
      const storage = criarArmazenamentoDoLivro({
        cliente: http.cliente,
        bucket: "recreio-fixture",
        assinatura: livro.assinatura,
        tempoLimiteMs: 2000,
      });
      const a = await adulto(),
        previa = await prepararPedidoDeDireitos(a.autor, {
          pedidoId: randomUUID(),
          tipo: "retirar_perfil",
          perfis: [a.perfil.id],
        });
      const pedido = {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
          confirmoRetirada: true,
        },
        config = { assinatura: livro.assinatura, storage, fonte: "a".repeat(40) };
      await expect(confirmarRetiradaDePerfil(a.autor, pedido, config)).rejects.toMatchObject({
        code: "DIREITOS_INDISPONIVEIS",
      });
      await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
      await storage.congelarCabecalho(await storage.lerCabecalho(), "2026-11-19T11:00:00.000Z");
      await expect(confirmarRetiradaDePerfil(a.autor, pedido, config)).rejects.toMatchObject({
        code: "DIREITOS_INDISPONIVEIS",
      });
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, a.perfil.id)))[0],
      ).toMatchObject({ status: "active", rightsOperationId: null });
      expect(
        await db.select().from(operations).where(eq(operations.preparationId, previa.preparacaoId)),
      ).toHaveLength(0);
    } finally {
      livro.encerrar();
      await http.fechar();
    }
  });
  it("recupera admissão externa anterior ao commit nativo e não duplica a cadeia", async () => {
    const livro = fixtureDoLivro(),
      http = await criarBucketDoLivro();
    try {
      const storage = criarArmazenamentoDoLivro({
        cliente: http.cliente,
        bucket: "recreio-fixture",
        assinatura: livro.assinatura,
        tempoLimiteMs: 2000,
      });
      await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
      const a = await adulto(),
        previa = await prepararPedidoDeDireitos(a.autor, {
          pedidoId: randomUUID(),
          tipo: "retirar_perfil",
          perfis: [a.perfil.id],
        });
      const op = await consentirRetiradaNoBanco(
        a.autor,
        {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
          confirmoRetirada: true,
        },
        { assinatura: livro.assinatura, fonte: "a".repeat(40), epoca: 0 },
      );
      const [linha] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
      if (!linha) throw new Error("Operation absent");
      await admitirIntencaoNoLivro({
        storage,
        assinatura: livro.assinatura,
        bytes: linha.signedIntent,
        instante: new Date().toISOString(),
      });
      expect(
        (await publicarProximoConsentimento({ storage, assinatura: livro.assinatura })).situacao,
      ).toBe("admitida");
      expect(
        (await publicarProximoConsentimento({ storage, assinatura: livro.assinatura })).situacao,
      ).toBe("ociosa");
      expect((await storage.lerCabecalho()).documento.entradas).toBe(1);
      const [admitida] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
      expect(admitida?.state).toBe("admitted");
      expect(admitida?.completedAt).toBeNull();
      expect(
        (
          await db
            .select()
            .from(auditEvents)
            .where(
              and(
                eq(auditEvents.actorId, a.conta.id),
                eq(auditEvents.eventType, "recreio.rights_admitted"),
              ),
            )
        ).length,
      ).toBe(1);
    } finally {
      livro.encerrar();
      await http.fechar();
    }
  });
  it("intenção corrompida fica em revisão sem publicar dados ou executar efeitos", async () =>
    cenario(async (f) => {
      const op = await f.confirmar(await f.previa()),
        http = await criarBucketDoLivro();
      try {
        const storage = criarArmazenamentoDoLivro({
          cliente: http.cliente,
          bucket: "recreio-fixture",
          assinatura: f.config.assinatura,
          tempoLimiteMs: 2000,
        });
        await db
          .update(operations)
          .set({ signedIntent: Buffer.from("corrompida") })
          .where(eq(operations.id, op.operacaoId));
        expect(
          (await publicarProximoConsentimento({ storage, assinatura: f.config.assinatura }))
            .situacao,
        ).toBe("revisao");
        const [linha] = await db.select().from(operations).where(eq(operations.id, op.operacaoId));
        expect(linha?.reviewCode).toBe("integrity");
        expect(linha?.admittedAt).toBeNull();
        expect(http.pedidos).toHaveLength(0);
      } finally {
        await http.fechar();
      }
    }));
});
