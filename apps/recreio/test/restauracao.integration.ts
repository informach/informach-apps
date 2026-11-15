import { gunzipSync, gzipSync } from "node:zlib";
import { AuditPersistenceError } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  events,
  recreioSpaceJournal as journal,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { criarMundo, REGRAS_DA_PROVA, restaurar, VERSAO_DO_MUNDO } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { criarRoteiro, moradorDeNome } from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { aplicarRecuperacao, prepararRecuperacao } from "@/features/recuperacao/repository";
import {
  aplicarRestauracaoDoMorada,
  prepararRestauracaoDoMorada,
  restaurarMorada,
} from "../scripts/recuperacao-morada";
import { aposentarInstancias, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia } from "./jogo-apoio";

/** Histórico real do Morada, persistido pela API, com a fotografia mais nova danificada. */
async function cenario(legado = false) {
  await aposentarInstancias();
  const lia = await novoJogador({ apelido: "Nome privado" });
  const mundoId = await mundoDe(lia);
  const sessao = await entrarNoJogo(lia);
  const host = await novaInstancia();
  expect((await abrirPelaRota(sessao, mundoId)).status).toBe(200);
  const posse = await host.cliente.reivindicarPosse(mundoId);
  const mundo = criarMundo({
    mundoId,
    semente: 1234,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [lia.perfil.id],
    regras: REGRAS_DA_PROVA,
  });
  const roteiro = criarRoteiro(mundo);
  const sid = roteiro.entrar(lia.perfil.id);
  const moradora = moradorDeNome(mundo, "Lia");
  const fotografar = () => {
    const foto = mundo.fotografar();
    if (!legado) return gzipSync(JSON.stringify(foto));
    const { fundacao, ...estadoV1 } = foto.estado;
    if (fundacao !== null) throw new Error("Fixture V1 não admite criação V2");
    return gzipSync(JSON.stringify({ ...foto, estado: { ...estadoV1, versao: 1 } }));
  };
  const schemaVersion = legado ? 1 : VERSAO_DO_MUNDO;
  const primeira = fotografar();
  await host.cliente.gravarFotografia({
    mundoId,
    cerca: posse.cerca,
    revisaoEsperada: 0,
    diarioSeq: 0,
    tick: 0,
    schemaVersion,
    tipo: "checkpoint",
    bytes: primeira,
  });
  expect(roteiro.comandar(sid, moradora.id, { t: "reservar" })).toMatchObject({ ok: true });
  expect(roteiro.comandar(sid, moradora.id, { t: "definir_preferido", valor: true })).toMatchObject(
    { ok: true },
  );
  roteiro.andar(10);
  const entradas = roteiro.saida.fatos.map((fato, n) => ({
    seq: n + 1,
    tick: fato.tick,
    fatoId: fato.id,
    bytes: new TextEncoder().encode(JSON.stringify(fato)),
  }));
  expect(entradas).toHaveLength(1);
  await host.cliente.anexarAoDiario({ mundoId, cerca: posse.cerca, entradas });
  const segunda = fotografar();
  await host.cliente.gravarFotografia({
    mundoId,
    cerca: posse.cerca,
    revisaoEsperada: 1,
    diarioSeq: entradas.length,
    tick: mundo.estado.relogio.tick,
    schemaVersion,
    tipo: "checkpoint",
    bytes: segunda,
  });
  await host.cliente.liberarPosse({ mundoId, cerca: posse.cerca, motivo: "erro" });
  const danificada = Buffer.from(segunda);
  const meio = Math.floor(danificada.length / 2);
  danificada[meio] = (danificada[meio] ?? 0) ^ 0xff;
  await db
    .update(snapshots)
    .set({ data: danificada })
    .where(and(eq(snapshots.spaceId, mundoId), eq(snapshots.revision, 2)));
  const pedido = {
    mundoId,
    revisaoFonte: 1,
    revisaoEsperada: 2,
    operacaoId: crypto.randomUUID(),
    motivo: "ensaio_de_recuperacao",
  };
  return { lia, mundoId, sessao, host, pedido, moradora, danificada, entradas };
}

async function evidencias(mundoId: string) {
  const [mundo] = await db.select().from(spaces).where(eq(spaces.id, mundoId));
  const fotos = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.spaceId, mundoId))
    .orderBy(snapshots.revision);
  const auditoria = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.eventType, "recreio.space_restored"),
        sql`${events.payload}->>'spaceId' = ${mundoId}`,
      ),
    );
  return { mundo, fotos, auditoria };
}

describe("restauração operacional do Morada", () => {
  it("migra fotografia V1 preservando o diário e publica o formato atual em transação", async () => {
    const c = await cenario(true);
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    expect(preparada.material.foto.schemaVersion).toBe(1);
    expect(preparada.fotografia.schemaVersion).toBe(VERSAO_DO_MUNDO);
    const reconstruida = restaurar(
      JSON.parse(gunzipSync(preparada.fotografia.bytes).toString("utf8")),
    );
    expect(reconstruida.estado.fundacao).toBeNull();
    expect(reconstruida.estado.moradores.ordem).toHaveLength(6);
    expect(
      Object.values(reconstruida.estado.moradores.porId).some(
        (morador) => morador?.preferidoDe === c.lia.perfil.id,
      ),
    ).toBe(true);
    await aplicarRestauracaoDoMorada(preparada);
    const prova = await evidencias(c.mundoId);
    expect(prova.mundo?.schemaVersion).toBe(VERSAO_DO_MUNDO);
    expect(prova.fotos.map((foto) => foto.schemaVersion)).toEqual([1, 1, VERSAO_DO_MUNDO]);
    expect(prova.auditoria).toHaveLength(1);
  });
  it("servidor antigo recusa restaurar fotografia antiga de mundo em formato futuro", async () => {
    const c = await cenario();
    await db
      .update(spaces)
      .set({ schemaVersion: VERSAO_DO_MUNDO + 1 })
      .where(eq(spaces.id, c.mundoId));
    const antes = await evidencias(c.mundoId);
    await expect(prepararRestauracaoDoMorada(c.pedido)).rejects.toMatchObject({
      codigo: "INTEGRIDADE",
    });
    expect(await evidencias(c.mundoId)).toEqual(antes);
  });

  it("alteração de formato depois do preparo invalida o material sem publicar revisão", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    await db
      .update(spaces)
      .set({ schemaVersion: VERSAO_DO_MUNDO + 1 })
      .where(eq(spaces.id, c.mundoId));
    const antes = await evidencias(c.mundoId);
    await expect(aplicarRestauracaoDoMorada(preparada)).rejects.toMatchObject({
      codigo: "MATERIAL_ALTERADO",
    });
    expect(await evidencias(c.mundoId)).toEqual(antes);
  });

  it("escritor da restauração recusa downgrade mesmo com material atual e adapter inadequado", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    await db
      .update(spaces)
      .set({ schemaVersion: VERSAO_DO_MUNDO + 1 })
      .where(eq(spaces.id, c.mundoId));
    const material = await prepararRecuperacao(preparada.pedido);
    const antes = await evidencias(c.mundoId);
    await expect(
      aplicarRecuperacao(preparada.pedido, material, preparada.fotografia),
    ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    expect(await evidencias(c.mundoId)).toEqual(antes);
  });

  it("prepara sem gravar, publica revisão nova e retoma com os fatos críticos", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    expect(preparada.resumo).toMatchObject({ novaRevisao: 3, diarioSeq: 1, fatosReaplicados: 1 });
    const antes = await evidencias(c.mundoId);
    expect(antes.fotos).toHaveLength(2);
    expect(antes.auditoria).toHaveLength(0);
    const recibo = await aplicarRestauracaoDoMorada(preparada);
    expect(recibo).toMatchObject({
      sourceRevision: 1,
      previousRevision: 2,
      revision: 3,
      journalSeq: 1,
    });
    const depois = await evidencias(c.mundoId);
    expect(depois.mundo).toMatchObject({ status: "hibernating", revision: 3, journalSeq: 1 });
    expect(depois.fotos).toHaveLength(3);
    expect(depois.fotos[1]?.data).toEqual(c.danificada);
    expect(depois.auditoria).toHaveLength(1);
    expect(depois.auditoria[0]?.actorId).toBeNull();
    expect(depois.auditoria[0]?.payload).toEqual(recibo);
    expect(JSON.stringify(depois.auditoria)).not.toMatch(
      /Nome privado|Lia|sha256|apelido|codigoDeConvite/,
    );
    expect((await abrirPelaRota(c.sessao, c.mundoId)).status).toBe(200);
    const posse = await c.host.cliente.reivindicarPosse(c.mundoId);
    const foto = await c.host.cliente.lerFotografia({ mundoId: c.mundoId, cerca: posse.cerca });
    if (!foto) throw new Error("Falta fotografia recuperada");
    expect(foto.meta.revisao).toBe(3);
    const voltou = restaurar(JSON.parse(gunzipSync(foto.bytes).toString("utf8")));
    expect(voltou.estado.id).toBe(c.mundoId);
    expect(voltou.estado.moradores.porId[c.moradora.id]?.preferidoDe).toBe(c.lia.perfil.id);
    expect(
      await c.host.cliente.lerDiario({
        mundoId: c.mundoId,
        cerca: posse.cerca,
        apos: foto.meta.diarioSeq,
      }),
    ).toEqual([]);
    // Resposta perdida: o recibo continua sendo recuperado com o mundo ativo.
    expect(await restaurarMorada(c.pedido)).toEqual(recibo);
    expect((await evidencias(c.mundoId)).auditoria).toHaveLength(1);
  });

  it("tentativas concorrentes da mesma operação produzem uma revisão e um recibo", async () => {
    const c = await cenario();
    const recibos = await Promise.all(Array.from({ length: 6 }, () => restaurarMorada(c.pedido)));
    for (const recibo of recibos) expect(recibo).toEqual(recibos[0]);
    const depois = await evidencias(c.mundoId);
    expect(depois.fotos).toHaveLength(3);
    expect(depois.auditoria).toHaveLength(1);
    await expect(restaurarMorada({ ...c.pedido, motivo: "outro_motivo" })).rejects.toMatchObject({
      codigo: "OPERACAO_REUTILIZADA",
    });
  });

  it("não restaura um mundo que abriu depois da preparação", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    expect((await abrirPelaRota(c.sessao, c.mundoId)).status).toBe(200);
    await expect(aplicarRestauracaoDoMorada(preparada)).rejects.toMatchObject({
      codigo: "MUNDO_NAO_PARADO",
    });
    expect((await evidencias(c.mundoId)).fotos).toHaveLength(2);
  });

  it("revisão nova entre preparação e aplicação recusa o material antigo", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    await abrirPelaRota(c.sessao, c.mundoId);
    const posse = await c.host.cliente.reivindicarPosse(c.mundoId);
    await c.host.cliente.gravarFotografia({
      mundoId: c.mundoId,
      cerca: posse.cerca,
      revisaoEsperada: 2,
      diarioSeq: 1,
      tick: preparada.fotografia.tick,
      schemaVersion: preparada.fotografia.schemaVersion,
      tipo: "hibernate",
      bytes: preparada.fotografia.bytes,
    });
    await c.host.cliente.liberarPosse({ mundoId: c.mundoId, cerca: posse.cerca, motivo: "erro" });
    await expect(aplicarRestauracaoDoMorada(preparada)).rejects.toMatchObject({
      codigo: "MATERIAL_ALTERADO",
    });
    const depois = await evidencias(c.mundoId);
    expect(depois.fotos).toHaveLength(3);
    expect(depois.auditoria).toHaveLength(0);
  });

  it("mudança de bytes sem mudar o topo também invalida a preparação", async () => {
    const c = await cenario();
    const preparada = await prepararRestauracaoDoMorada(c.pedido);
    await db
      .update(journal)
      .set({ payload: Buffer.from("alterado"), byteSize: 8 })
      .where(eq(journal.spaceId, c.mundoId));
    await expect(aplicarRestauracaoDoMorada(preparada)).rejects.toMatchObject({
      codigo: "MATERIAL_ALTERADO",
    });
    expect((await evidencias(c.mundoId)).mundo?.revision).toBe(2);
  });

  it("recusa origem corrompida e diário incompleto", async () => {
    const c = await cenario();
    await expect(
      prepararRestauracaoDoMorada({ ...c.pedido, revisaoFonte: 2 }),
    ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
    await db.delete(journal).where(eq(journal.spaceId, c.mundoId));
    await expect(prepararRestauracaoDoMorada(c.pedido)).rejects.toMatchObject({
      codigo: "INTEGRIDADE",
    });
    const depois = await evidencias(c.mundoId);
    expect(depois.fotos).toHaveLength(2);
    expect(depois.auditoria).toHaveLength(0);
  });

  it("falha da auditoria reverte fotografia e revisão e permite repetir a operação", async () => {
    const c = await cenario();
    await db.execute(
      sql`create function audit.recusar_restauracao_em_teste() returns trigger language plpgsql as $$ begin if new.event_type = 'recreio.space_restored' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_restauracao_em_teste before insert on audit.events for each row execute function audit.recusar_restauracao_em_teste()`,
    );
    try {
      await expect(restaurarMorada(c.pedido)).rejects.toBeInstanceOf(AuditPersistenceError);
      const depois = await evidencias(c.mundoId);
      expect(depois.mundo?.revision).toBe(2);
      expect(depois.fotos).toHaveLength(2);
      expect(depois.auditoria).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger if exists recusar_restauracao_em_teste on audit.events`);
      await db.execute(sql`drop function if exists audit.recusar_restauracao_em_teste()`);
    }
    expect(await restaurarMorada(c.pedido)).toMatchObject({ revision: 3 });
  });
});
