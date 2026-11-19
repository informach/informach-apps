import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceJournal as journal,
  recreioRightsOperations as operations,
  sessions,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { criarMundo, listar } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { abrirFotografia } from "@informach/morada-sim/formatos";
import { describe, expect, it } from "vitest";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { concluirProximaDrenagem } from "@/features/direitos/drenagem-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirRetiradaNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { aceitarConvite, criarConvite } from "@/features/mundos/service";
import { processarProximaFotografiaDeDireitos } from "../scripts/direitos/fotografias";
import { recuperarProximoDiarioDeDireitos } from "../scripts/direitos/recuperacao";
import { aposentarInstancias, codigoDoBanco, novoJogador } from "./apoio";
import {
  abrirPelaRota,
  cabecalhosDoHost,
  entrarNoJogo,
  MORADA,
  mundoDe,
  novaInstancia,
} from "./jogo-apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";
import { pedir } from "./rotas";

async function cenario(fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  try {
    const f = await preparar(livro, http);
    await fn(f);
  } finally {
    livro.encerrar();
    await http.fechar();
    await aposentarInstancias();
  }
}
async function preparar(
  livro: ReturnType<typeof fixtureDoLivro>,
  http: Awaited<ReturnType<typeof criarBucketDoLivro>>,
) {
  await aposentarInstancias();
  const a = await novoJogador({ apelido: "Pessoa retirada" }),
    b = await novoJogador({ apelido: "Outro jogador" }),
    mundo = { id: await mundoDe(b) };
  const convite = await criarConvite(
    { perfilId: b.perfil.id, sessaoDeAparelhoId: b.ator.sessaoDeAparelhoId, jogo: null },
    mundo.id,
    { forma: "member" },
  );
  await aceitarConvite(
    { perfilId: a.perfil.id, sessaoDeAparelhoId: a.ator.sessaoDeAparelhoId },
    { codigo: convite.codigo },
  );
  const sidA = await entrarNoJogo(a),
    sidB = await entrarNoJogo(b),
    host = await novaInstancia();
  expect((await abrirPelaRota(sidA, mundo.id)).status).toBe(200);
  const posse = await host.cliente.reivindicarPosse(mundo.id),
    cerca = posse.cerca;
  for (const [sid, perfilId] of [
    [sidA.sid, a.perfil.id],
    [sidB.sid, b.perfil.id],
  ])
    expect(
      (
        await pedir("POST", `/api/interno/v1/mundos/${mundo.id}/entradas`, {
          headers: cabecalhosDoHost(MORADA, host.instanciaId),
          corpo: { cerca, sid, perfilId },
        })
      ).status,
    ).toBe(200);
  const sim = criarMundo({
    mundoId: mundo.id,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [a.perfil.id, b.perfil.id],
  });
  const inicial = sim.fotografar();
  await host.cliente.gravarFotografia({
    mundoId: mundo.id,
    cerca,
    revisaoEsperada: 0,
    diarioSeq: 0,
    tick: inicial.tick,
    schemaVersion: inicial.estado.versao,
    tipo: "checkpoint",
    bytes: gzipSync(JSON.stringify(inicial)),
  });
  sim.aplicar({ t: "sessao_entrou", sessaoId: sidA.sid, perfilId: a.perfil.id });
  sim.aplicar({ t: "sessao_entrou", sessaoId: sidB.sid, perfilId: b.perfil.id });
  const acesso = sim.estado.acessos.find((a) => a.perfilId === b.perfil.id);
  if (!acesso) throw new Error("Game access absent");
  // Fato produzido pelo motor, para conferir diário ainda não fotografado.
  // Sessão entrou e passagem curta do relógio podem não produzir fatos.
  expect(
    sim.aplicar({
      t: "conceder_acesso",
      perfilId: b.perfil.id,
      familiaId: acesso.familiaId,
      permissoes: acesso.permissoes.filter((p) => p !== "gastar"),
    }).ok,
  ).toBe(true);
  const fatos = sim.avancar(1000).fatos;
  expect(fatos.length).toBeGreaterThan(0);
  await host.cliente.anexarAoDiario({
    mundoId: mundo.id,
    cerca,
    entradas: fatos.map((f, i) => ({
      seq: i + 1,
      tick: f.tick,
      fatoId: f.id,
      bytes: new TextEncoder().encode(JSON.stringify(f)),
    })),
  });
  const final = sim.fotografar(),
    diarioSeq = fatos.length;
  const [sessao] = await db.select().from(sessions).where(eq(sessions.id, a.login.authSessionId));
  if (!sessao) throw new Error("Native session absent");
  const autor: AutorNativoRecente = {
    ...a.ator,
    login: { authSessionId: sessao.id, criadoEm: sessao.createdAt, expiraEm: sessao.expiresAt },
  };
  const storage = criarArmazenamentoDoLivro({
    assinatura: livro.assinatura,
    cliente: http.cliente,
    bucket: "recreio-fixture",
    tempoLimiteMs: 2000,
  });
  await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
  const previa = await prepararPedidoDeDireitos(autor, {
    pedidoId: randomUUID(),
    tipo: "retirar_perfil",
    perfis: [a.perfil.id],
  });
  const op = await consentirRetiradaNoBanco(
    autor,
    { preparacaoId: previa.preparacaoId, planoSha256: previa.planoSha256, confirmoRetirada: true },
    { assinatura: livro.assinatura, fonte: "a".repeat(40), epoca: 0 },
  );
  await publicarProximoConsentimento({ assinatura: livro.assinatura, storage });
  async function drenar() {
    return concluirProximaDrenagem({
      assinatura: livro.assinatura,
      prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 2000 }),
    });
  }
  async function salvarESair() {
    await host.cliente.gravarFotografia({
      mundoId: mundo.id,
      cerca,
      revisaoEsperada: 1,
      diarioSeq,
      tick: final.tick,
      schemaVersion: final.estado.versao,
      tipo: "hibernate",
      bytes: gzipSync(JSON.stringify(final)),
    });
    await host.cliente.liberarPosse({ mundoId: mundo.id, cerca, motivo: "vazio" });
  }
  return {
    a,
    b,
    mundo,
    host,
    cerca,
    diarioSeq,
    final,
    livro,
    http,
    storage,
    op,
    drenar,
    salvarESair,
  };
}

describe("drenagem de direitos pelo contrato existente do host", () => {
  it("fecha entradas, mantém a posse para o checkpoint e só congela após salvar", async () =>
    cenario(async (f) => {
      const [antes] = await db.select().from(spaces).where(eq(spaces.id, f.mundo.id));
      expect(antes).toMatchObject({
        status: "archived",
        rightsDraining: true,
        leaseEpoch: f.cerca,
        revision: 1,
        journalSeq: f.diarioSeq,
      });
      const encerradas = await db.select().from(games).where(eq(games.spaceId, f.mundo.id));
      expect(encerradas).toHaveLength(2);
      expect(encerradas.every((s) => s.endedAt !== null && s.endedSeq !== null)).toBe(true);
      expect(await f.drenar()).toMatchObject({ situacao: "aguardando_salvamento" });
      const nova = await entrarNoJogo(f.b);
      expect(await abrirPelaRota(nova, f.mundo.id)).toEqual({
        status: 409,
        corpo: { codigo: "MUNDO_INDISPONIVEL" },
      });
      expect(
        await codigoDoBanco(
          db.update(spaces).set({ name: "Alteração indevida" }).where(eq(spaces.id, f.mundo.id)),
        ),
      ).toBe("23514");
      await f.salvarESair();
      expect((await db.select().from(spaces).where(eq(spaces.id, f.mundo.id)))[0]).toMatchObject({
        status: "archived",
        rightsDraining: true,
        revision: 2,
      });
      expect(await f.drenar()).toMatchObject({ situacao: "mundo_drenado" });
      expect((await db.select().from(spaces).where(eq(spaces.id, f.mundo.id)))[0]).toMatchObject({
        rightsDraining: false,
        leaseEpoch: f.cerca + 1,
        revision: 2,
        journalSeq: f.diarioSeq,
      });
      const [passo] = await db.select().from(worlds).where(eq(worlds.operationId, f.op.operacaoId));
      expect(passo).toMatchObject({
        phase: "frozen",
        sourceRevision: 2,
        sourceJournalSeq: f.diarioSeq,
      });
      for (let n = 0; n < 2; n++)
        expect(
          (
            await processarProximaFotografiaDeDireitos({
              assinatura: f.livro.assinatura,
              storage: f.storage,
              leitor: null,
              politica: { retirarTextosDaFundacao: true },
            })
          ).situacao,
        ).toBe("fotografia_processada");
      const fotos = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, f.mundo.id))
        .orderBy(snapshots.revision);
      const ultima = fotos.at(-1);
      if (!ultima?.data) throw new Error("Photo absent");
      const texto = gunzipSync(ultima.data).toString("utf-8"),
        tratada = abrirFotografia(JSON.parse(texto));
      expect(tratada.tick).toBe(f.final.tick);
      expect(f.final.estado.fundacao).toBeNull();
      const publico = (moradores: typeof f.final.estado.moradores) =>
        listar(moradores).map(({ preferidoDe, versao, ...restante }) => restante);
      expect(publico(tratada.estado.moradores)).toEqual(publico(f.final.estado.moradores));
      expect(tratada.estado.acessos.find((a) => a.perfilId === f.b.perfil.id)).toEqual(
        f.final.estado.acessos.find((a) => a.perfilId === f.b.perfil.id),
      );
      expect(texto).not.toContain(f.a.perfil.id);
      expect(texto).toContain(f.b.perfil.id);
    }));
  it("recupera o diário confirmado após falha do host antes de concluir a drenagem", async () =>
    cenario(async (f) => {
      await f.host.cliente.liberarPosse({ mundoId: f.mundo.id, cerca: f.cerca, motivo: "erro" });
      const fotosAntes = await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id));
      const diarioAntes = await db
        .select()
        .from(journal)
        .where(eq(journal.spaceId, f.mundo.id))
        .orderBy(journal.seq);
      expect(await f.drenar()).toMatchObject({ situacao: "recuperacao_pendente" });
      expect(
        await recuperarProximoDiarioDeDireitos({
          assinatura: f.livro.assinatura,
          storage: f.storage,
          leitor: null,
        }),
      ).toMatchObject({ situacao: "diario_recuperado" });
      const fotosDepois = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.spaceId, f.mundo.id))
        .orderBy(snapshots.revision);
      expect(fotosDepois).toHaveLength(fotosAntes.length + 1);
      expect(fotosDepois[0]).toEqual(fotosAntes[0]);
      const ultima = fotosDepois.at(-1);
      if (!ultima?.data) throw new Error("Recovered photo absent");
      const foto = abrirFotografia(JSON.parse(gunzipSync(ultima.data).toString("utf-8")));
      expect(foto.estado.acessos.find((a) => a.perfilId === f.b.perfil.id)).toEqual(
        f.final.estado.acessos.find((a) => a.perfilId === f.b.perfil.id),
      );
      expect(foto.tick).toBe(
        diarioAntes.reduce((n, e) => Math.max(n, e.tick), fotosAntes[0]?.tick ?? 0),
      );
      expect(
        await db.select().from(journal).where(eq(journal.spaceId, f.mundo.id)).orderBy(journal.seq),
      ).toEqual(diarioAntes);
      expect(await f.drenar()).toMatchObject({ situacao: "mundo_drenado" });
      expect(
        (await db.select().from(worlds).where(eq(worlds.operationId, f.op.operacaoId)))[0],
      ).toMatchObject({ phase: "frozen", sourceRevision: 2, sourceJournalSeq: f.diarioSeq });
    }));
  it("auditoria recusada reverte a cerca e o recibo da drenagem", async () =>
    cenario(async (f) => {
      await f.salvarESair();
      await db.execute(
        sql`create function audit.recusar_drenagem_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_world_drained' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_drenagem_teste before insert on audit.events for each row execute function audit.recusar_drenagem_teste()`,
      );
      try {
        await expect(f.drenar()).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_drenagem_teste on audit.events`);
        await db.execute(sql`drop function audit.recusar_drenagem_teste()`);
      }
      expect((await db.select().from(spaces).where(eq(spaces.id, f.mundo.id)))[0]).toMatchObject({
        rightsDraining: true,
        leaseEpoch: f.cerca,
      });
      expect(
        (await db.select().from(worlds).where(eq(worlds.operationId, f.op.operacaoId)))[0]?.phase,
      ).toBe("draining");
    }));
  it("fato inválido vai para revisão sem criar foto ou descartar o diário", async () =>
    cenario(async (f) => {
      await f.host.cliente.liberarPosse({ mundoId: f.mundo.id, cerca: f.cerca, motivo: "erro" });
      const [entrada] = await db
        .select()
        .from(journal)
        .where(eq(journal.spaceId, f.mundo.id))
        .orderBy(journal.seq)
        .limit(1);
      if (!entrada) throw new Error("Journal absent");
      const invalido = Buffer.from(
        JSON.stringify({
          id: entrada.factId,
          tick: entrada.tick,
          familiaId: null,
          causa: { comandoId: null, autor: "sim", motivo: "fixture" },
          dados: { tipo: "desconhecido" },
        }),
      );
      await db
        .update(journal)
        .set({ payload: invalido, byteSize: invalido.byteLength })
        .where(and(eq(journal.spaceId, f.mundo.id), eq(journal.seq, entrada.seq)));
      const fotosAntes = await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id));
      expect(
        await recuperarProximoDiarioDeDireitos({
          assinatura: f.livro.assinatura,
          storage: f.storage,
          leitor: null,
        }),
      ).toMatchObject({ situacao: "revisao" });
      expect(await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id))).toEqual(
        fotosAntes,
      );
      expect(
        (await db.select().from(journal).where(eq(journal.spaceId, f.mundo.id)))[0]?.payload,
      ).toEqual(invalido);
      expect(
        (await db.select().from(operations).where(eq(operations.id, f.op.operacaoId)))[0],
      ).toMatchObject({ state: "review", reviewCode: "integrity" });
      expect((await db.select().from(spaces).where(eq(spaces.id, f.mundo.id)))[0]).toMatchObject({
        rightsDraining: true,
        revision: 1,
      });
    }));
  it("falha de auditoria reverte a foto recuperada e permite repetir sem novo consentimento", async () =>
    cenario(async (f) => {
      await f.host.cliente.liberarPosse({ mundoId: f.mundo.id, cerca: f.cerca, motivo: "erro" });
      await db.execute(
        sql`create function audit.recusar_recuperacao_teste() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_world_recovered' then raise exception 'auditoria indisponível'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_recuperacao_teste before insert on audit.events for each row execute function audit.recusar_recuperacao_teste()`,
      );
      try {
        await expect(
          recuperarProximoDiarioDeDireitos({
            assinatura: f.livro.assinatura,
            storage: f.storage,
            leitor: null,
          }),
        ).rejects.toBeInstanceOf(AuditPersistenceError);
      } finally {
        await db.execute(sql`drop trigger recusar_recuperacao_teste on audit.events`);
        await db.execute(sql`drop function audit.recusar_recuperacao_teste()`);
      }
      expect((await db.select().from(spaces).where(eq(spaces.id, f.mundo.id)))[0]).toMatchObject({
        revision: 1,
        rightsDraining: true,
      });
      expect(
        await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id)),
      ).toHaveLength(1);
      expect(
        await recuperarProximoDiarioDeDireitos({
          assinatura: f.livro.assinatura,
          storage: f.storage,
          leitor: null,
        }),
      ).toMatchObject({ situacao: "diario_recuperado" });
      expect(
        await recuperarProximoDiarioDeDireitos({
          assinatura: f.livro.assinatura,
          storage: f.storage,
          leitor: null,
        }),
      ).toEqual({ situacao: "ociosa" });
      expect(
        await db.select().from(snapshots).where(eq(snapshots.spaceId, f.mundo.id)),
      ).toHaveLength(2);
    }));
});
