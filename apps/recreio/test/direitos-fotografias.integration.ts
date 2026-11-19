import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioSpaceJournal as journal,
  recreioSpaceMembers as members,
  recreioRightsOperations as operations,
  sessions,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { criarMundo } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  confirmarFotografiaDeDireitos,
  reservarFotografiaDeDireitos,
} from "@/features/direitos/fotografias-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirRetiradaNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { criarPerfilProprio } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { processarProximaFotografiaDeDireitos as processar } from "../scripts/direitos/fotografias";
import { prepararFotoPessoalDoMorada } from "../scripts/direitos/morada";
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
  const { perfil } = await criarPerfilProprio(autor, {
    apelido: "Pessoa privada",
    avatar: "padrao",
  });
  return { autor, perfil };
}
async function cenario(
  fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>,
  entradas = 0,
) {
  const f = await preparar(entradas);
  try {
    await fn(f);
  } finally {
    f.livro.encerrar();
    await f.http.fechar();
  }
}
async function preparar(entradas: number) {
  const livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    cliente: http.cliente,
    bucket: "recreio-fixture",
    assinatura: livro.assinatura,
    tempoLimiteMs: 2000,
  });
  await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
  const a = await adulto(),
    outro = await adulto();
  // Estado sintético válido com outro gestor. Não fabrica aceite de transferência
  // nem comprova a jornada humana, que permanece para a homologação final.
  const [mundo] = await db
    .insert(spaces)
    .values({
      gameId: "morada",
      name: "Mundo compartilhado",
      contentPolicy: "family",
      createdByProfileId: a.perfil.id,
      stewardProfileId: outro.perfil.id,
      leaseEpoch: 1,
    })
    .returning();
  if (!mundo) throw new Error("World absent");
  await db
    .insert(members)
    .values({ spaceId: mundo.id, profileId: outro.perfil.id, role: "steward", state: "active" });
  const simulacao = criarMundo({
    mundoId: mundo.id,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [a.perfil.id, outro.perfil.id],
  });
  const foto = simulacao.fotografar(),
    bytes = gzipSync(JSON.stringify(foto));
  for (const revision of [1, 2])
    await db.insert(snapshots).values({
      spaceId: mundo.id,
      revision,
      fence: 1,
      schemaVersion: foto.estado.versao,
      journalSeq: entradas,
      tick: foto.tick,
      kind: revision === 1 ? "pinned" : "hibernate",
      storage: "pg",
      data: bytes,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  await db
    .update(spaces)
    .set({ revision: 2, journalSeq: entradas, schemaVersion: foto.estado.versao })
    .where(eq(spaces.id, mundo.id));
  // Diário sintético já coberto pela fotografia admitida. A plataforma não
  // interpreta fatos do jogo para compactar um prefixo confirmado pelo host.
  if (entradas)
    await db.insert(journal).values(
      Array.from({ length: entradas }, (_, i) => {
        const payload = Buffer.from(JSON.stringify({ fatoCoberto: i + 1, autor: a.perfil.id }));
        return {
          spaceId: mundo.id,
          seq: i + 1,
          fence: 1,
          tick: foto.tick,
          factId: `coberto-${i + 1}`,
          payload,
          byteSize: payload.length,
        };
      }),
    );
  const previa = await prepararPedidoDeDireitos(a.autor, {
    pedidoId: randomUUID(),
    tipo: "retirar_perfil",
    perfis: [a.perfil.id],
  });
  const op = await consentirRetiradaNoBanco(
    a.autor,
    { preparacaoId: previa.preparacaoId, planoSha256: previa.planoSha256, confirmoRetirada: true },
    { assinatura: livro.assinatura, fonte: "a".repeat(40), epoca: 0 },
  );
  await publicarProximoConsentimento({ assinatura: livro.assinatura, storage });
  const config = {
    assinatura: livro.assinatura,
    storage,
    leitor: null,
    politica: { retirarTextosDaFundacao: true },
  };
  return { livro, http, config, a, outro, mundo, foto, bytes, op };
}

describe("retirada nas fotografias com simulação, PostgreSQL e SDK HTTP reais", () => {
  it("processa uma por passagem, inclusive fixada, e conserva outro perfil/formato/revisões", async () =>
    cenario(async (f) => {
      expect((await processar(f.config)).situacao).toBe("fotografia_processada");
      expect((await processar(f.config)).situacao).toBe("fotografia_processada");
      expect((await processar(f.config)).situacao).toBe("dependencias");
      expect((await processar(f.config)).situacao).toBe("ociosa");
      const fotos = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, f.mundo.id))
        .orderBy(snapshots.revision);
      expect(fotos.map((p) => [p.revision, p.kind, p.schemaVersion, p.tick, p.journalSeq])).toEqual(
        [
          [1, "pinned", f.foto.estado.versao, f.foto.tick, 0],
          [2, "hibernate", f.foto.estado.versao, f.foto.tick, 0],
        ],
      );
      for (const foto of fotos) {
        if (!foto.data) throw new Error("Snapshot bytes absent");
        const texto = gunzipSync(foto.data).toString("utf-8");
        expect(texto).not.toContain(f.a.perfil.id);
        expect(texto).toContain(f.outro.perfil.id);
        expect(JSON.parse(texto).estado.familias).toEqual(f.foto.estado.familias);
        expect(createHash("sha256").update(foto.data).digest("hex")).toBe(foto.sha256);
      }
      const [op] = await db.select().from(operations).where(eq(operations.id, f.op.operacaoId));
      expect(op?.state).toBe("running");
      expect(op?.completedAt).toBeNull();
      const [mundo] = await db.select().from(spaces).where(eq(spaces.id, f.mundo.id));
      expect(mundo?.status).toBe("archived");
      expect(mundo?.revision).toBe(2);
    }));

  it("falha de auditoria não altera foto/cursor nem declara conclusão", async () =>
    cenario(async (f) => {
      await db.execute(
        sql`create function audit.recusar_foto_direitos_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_photo_processed' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_foto_direitos_fixture before insert on audit.events for each row execute function audit.recusar_foto_direitos_fixture()`,
      );
      try {
        await expect(processar(f.config)).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_foto_direitos_fixture on audit.events`);
        await db.execute(sql`drop function audit.recusar_foto_direitos_fixture()`);
      }
      const [foto] = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, f.mundo.id))
        .orderBy(snapshots.revision)
        .limit(1);
      expect(foto?.data).toEqual(f.bytes);
      const [passo] = await db.select().from(worlds).where(eq(worlds.operationId, f.op.operacaoId));
      expect(passo?.snapshotCursor).toBe(0);
      expect(passo?.phase).toBe("frozen");
    }));

  it("worker antigo não publica depois de perder o token da reserva", async () =>
    cenario(async (f) => {
      const prova = await conferirPrefixoDoLivro({
        storage: f.config.storage,
        maxEntradas: 10,
        tempoLimiteMs: 2000,
      });
      const reserva = await reservarFotografiaDeDireitos({
        prova,
        assinatura: f.config.assinatura,
      });
      if (reserva?.tipo !== "fotografia" || reserva.fonte.origem.tipo !== "pg")
        throw new Error("Snapshot reservation absent");
      const resultado = prepararFotoPessoalDoMorada(
        reserva.fonte.origem.bytes,
        {
          mundoId: f.mundo.id,
          schemaVersion: reserva.fonte.meta.schemaVersion,
          tick: reserva.fonte.meta.tick,
          sha256: reserva.fonte.meta.sha256,
          bytes: reserva.fonte.meta.bytes,
        },
        f.a.perfil.id,
        f.config.politica,
      );
      await db
        .update(operations)
        .set({ leaseToken: randomUUID() })
        .where(eq(operations.id, f.op.operacaoId));
      await expect(confirmarFotografiaDeDireitos(reserva, resultado)).rejects.toMatchObject({
        code: "DIREITOS_POSSE",
      });
      const [foto] = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, f.mundo.id))
        .orderBy(snapshots.revision)
        .limit(1);
      expect(foto?.data).toEqual(f.bytes);
    }));

  it("recusa livro congelado antes de reservar ou transformar fotografias", async () =>
    cenario(async (f) => {
      await f.config.storage.congelarCabecalho(
        await f.config.storage.lerCabecalho(),
        new Date().toISOString(),
      );
      await expect(processar(f.config)).rejects.toMatchObject({ code: "DIREITOS_LIVRO" });
      const [op] = await db.select().from(operations).where(eq(operations.id, f.op.operacaoId));
      expect(op?.state).toBe("admitted");
      expect(op?.leaseToken).toBeNull();
    }));
  it("compacta só o prefixo coberto em lotes, sem resetar o cursor autoritativo", async () =>
    cenario(async (f) => {
      await processar(f.config);
      await processar(f.config);
      await processar(f.config);
      expect(await processar(f.config)).toMatchObject({
        situacao: "diario_compactado",
        entradas: 100,
      });
      expect(await processar(f.config)).toMatchObject({
        situacao: "diario_compactado",
        entradas: 5,
      });
      expect(await processar(f.config)).toEqual({ situacao: "ociosa" });
      expect((await db.select().from(journal).where(eq(journal.spaceId, f.mundo.id))).length).toBe(
        0,
      );
      const [mundo] = await db.select().from(spaces).where(eq(spaces.id, f.mundo.id));
      expect(mundo?.journalSeq).toBe(105);
      expect(mundo?.revision).toBe(2);
      const fotos = await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id));
      expect(fotos.every((p) => p.journalSeq === 105)).toBe(true);
      expect(
        (await db.select().from(operations).where(eq(operations.id, f.op.operacaoId)))[0]
          ?.completedAt,
      ).toBeNull();
    }, 105));

  it("diário fora do salvamento confirmado impede compactar qualquer entrada", async () =>
    cenario(async (f) => {
      await processar(f.config);
      await processar(f.config);
      await processar(f.config);
      const payload = Buffer.from("fato nao coberto");
      await db.insert(journal).values({
        spaceId: f.mundo.id,
        seq: 3,
        fence: 1,
        tick: 0,
        factId: "fora-da-cobertura",
        payload,
        byteSize: payload.length,
      });
      await expect(processar(f.config)).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
      expect((await db.select().from(journal).where(eq(journal.spaceId, f.mundo.id))).length).toBe(
        3,
      );
    }, 2));
});
