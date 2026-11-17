import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceLeases as leases,
  recreioSessionSavePermits as permits,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import { describe, expect, it, vi } from "vitest";
import {
  emitirIngresso,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { aposentarInstancias, eventosCom, novoJogador } from "./apoio";
import { abrirPelaRota, mundoDe, novaInstancia, OUTRO_JOGO } from "./jogo-apoio";
import { pedir } from "./rotas";

vi.mock("@/lib/env", async (original) => {
  const real = await original<typeof import("@/lib/env")>();
  return { ...real, env: { ...real.env, RECREIO_CHECKPOINT_MODE: "on" } };
});
vi.mock("@informach/config/jogos", async (original) => {
  const real = await original<typeof import("@informach/config/jogos")>();
  const jogos = [
    ...real.JOGOS,
    {
      ...real.JOGOS[0],
      id: "jogo-de-teste",
      nome: "Mundo com salvamento",
      rota: "/jogar/jogo-de-teste",
      capacidades: { ...real.JOGOS[0].capacidades, checkpoint: "servidor" },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});

async function preparar() {
  await aposentarInstancias();
  const pessoa = await novoJogador();
  const mundoId = await mundoDe(pessoa, OUTRO_JOGO);
  const ingresso = await emitirIngresso(pessoa.ator, { jogo: OUTRO_JOGO });
  const aberta = await trocarIngresso({ ingresso: ingresso.ingresso, suportaSalvamento: true });
  if (!aberta.salvamento) throw new Error("Capacidade ausente");
  const sessao = await sessaoDeJogoDoToken(aberta.token);
  const anterior = { token: aberta.token, sid: sessao.sid };
  const host = await novaInstancia(OUTRO_JOGO);
  expect((await abrirPelaRota(anterior, mundoId)).status).toBe(200);
  const posse = await host.cliente.reivindicarPosse(mundoId);
  await host.cliente.verificarEntrada({
    mundoId,
    cerca: posse.cerca,
    sid: sessao.sid,
    perfilId: pessoa.perfil.id,
  });
  const foto = (revisaoEsperada: number, diarioSeq = 0) =>
    host.cliente.gravarFotografia({
      mundoId,
      cerca: posse.cerca,
      revisaoEsperada,
      diarioSeq,
      tick: diarioSeq,
      schemaVersion: 1,
      tipo: "checkpoint",
      bytes: new TextEncoder().encode(JSON.stringify({ contador: diarioSeq })),
    });
  const pedido = { mundoId, sid: sessao.sid, cerca: posse.cerca };
  const iniciar = () => host.cliente.salvarSessao({ ...pedido, operacao: "preparar" });
  const concluir = (revisao: number, diarioSeq = 0) =>
    host.cliente.salvarSessao({ ...pedido, operacao: "concluir", revisao, diarioSeq });
  return {
    pessoa,
    mundoId,
    aberta,
    capacidade: aberta.salvamento,
    sessao,
    host,
    posse,
    foto,
    pedido,
    iniciar,
    concluir,
  };
}

describe("salvamento final do mundo pela instância", () => {
  it("posse que vence durante a auditoria não confirma o recibo", async () => {
    const r = await preparar();
    await r.iniciar();
    const foto = await r.foto(r.posse.revisao);
    await db
      .update(leases)
      .set({ expiresAt: sql`clock_timestamp()+interval '2 seconds'` })
      .where(eq(leases.spaceId, r.mundoId));
    await db.execute(sql`create sequence audit.espera_posse_salvamento_mundo`);
    await db.execute(sql`create function audit.esperar_posse_salvamento_mundo() returns trigger language plpgsql as $$ declare prazo timestamptz; begin
      if new.event_type='recreio.session_save_completed' then
        perform nextval('audit.espera_posse_salvamento_mundo');
        select l.expires_at into prazo from recreio.space_leases l join recreio.game_sessions g on g.space_id=l.space_id
          where g.id=(new.payload->>'sessionId')::uuid and l.released_at is null;
        perform pg_sleep(greatest(0,extract(epoch from prazo-clock_timestamp()))+0.02);
      end if; return new; end $$`);
    await db.execute(
      sql`create trigger esperar_posse_salvamento_mundo before insert on audit.events for each row execute function audit.esperar_posse_salvamento_mundo()`,
    );
    try {
      await expect(r.concluir(foto.revisao)).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
      const entradas = await db.execute<{ last_value: string; is_called: boolean }>(
        sql`select last_value::text,is_called from audit.espera_posse_salvamento_mundo`,
      );
      expect(entradas[0]).toEqual({ last_value: "1", is_called: true });
      expect(
        (await db.select().from(permits).where(eq(permits.sessionId, r.sessao.sid)))[0]?.status,
      ).toBe("ready");
    } finally {
      await db.execute(sql`drop trigger esperar_posse_salvamento_mundo on audit.events`);
      await db.execute(sql`drop function audit.esperar_posse_salvamento_mundo()`);
      await db.execute(sql`drop sequence audit.espera_posse_salvamento_mundo`);
    }
  });
  it("duas fases encerram gameplay antes da foto e confirmam uma vez sem parar os demais", async () => {
    const r = await preparar();
    const antiga = await r.foto(r.posse.revisao);
    await expect(r.concluir(antiga.revisao)).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    const inicio = await r.iniciar();
    expect(inicio.estado).toBe("ready");
    expect(await r.iniciar()).toEqual(inicio);
    expect(Date.parse(inicio.expiraEm)).toBeLessThanOrEqual(Date.now() + 30_000);
    await expect(
      r.host.cliente.verificarEntrada({ ...r.pedido, perfilId: r.pessoa.perfil.id }),
    ).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    await expect(r.concluir(antiga.revisao)).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    const atual = await r.foto(antiga.revisao);
    const concluida = await r.concluir(atual.revisao);
    expect(concluida).toEqual({ ...inicio, estado: "completed" });
    await r.host.cliente.anexarAoDiario({
      mundoId: r.mundoId,
      cerca: r.posse.cerca,
      entradas: [{ seq: 1, tick: 1, fatoId: crypto.randomUUID(), bytes: new Uint8Array([1]) }],
    });
    expect(await r.concluir(atual.revisao)).toEqual(concluida);
    await expect(r.concluir(atual.revisao, 1)).rejects.toMatchObject({ codigo: "FATO_DUPLICADO" });
    const [recibo] = await db.select().from(permits).where(eq(permits.sessionId, r.sessao.sid));
    if (!recibo) throw new Error("Recibo ausente");
    expect(recibo).toMatchObject({
      status: "completed",
      checkpointSpaceId: r.mundoId,
      checkpointFence: r.posse.cerca,
      checkpointRevision: atual.revisao,
      checkpointJournalSeq: 0,
      results: null,
    });
    expect((await eventosCom("savePermitId", recibo.id)).map((e) => e.eventType)).toEqual([
      "recreio.session_save_prepared",
      "recreio.session_save_completed",
    ]);
    expect(
      (await pedir("GET", "/api/sdk/v1/sessao/salvamento", { token: r.capacidade.token })).corpo,
    ).toEqual(concluida);
  });
  it("foto precisa cobrir o diário atual e conservar bytes/checksum íntegros", async () => {
    const r = await preparar();
    await r.iniciar();
    const antiga = await r.foto(r.posse.revisao);
    await r.host.cliente.anexarAoDiario({
      mundoId: r.mundoId,
      cerca: r.posse.cerca,
      entradas: [{ seq: 1, tick: 1, fatoId: crypto.randomUUID(), bytes: new Uint8Array([1]) }],
    });
    await expect(r.concluir(antiga.revisao)).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    const corrompida = await r.foto(antiga.revisao, 1);
    await db
      .update(snapshots)
      .set({ data: Buffer.from(JSON.stringify({ contador: 9 })) })
      .where(and(eq(snapshots.spaceId, r.mundoId), eq(snapshots.revision, corrompida.revisao)));
    await expect(r.concluir(corrompida.revisao, 1)).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    const valida = await r.foto(corrompida.revisao, 1);
    expect((await r.concluir(valida.revisao, 1)).estado).toBe("completed");
  });
  it("outra instância, cerca e navegador não podem iniciar ou fabricar a confirmação", async () => {
    const r = await preparar();
    const outra = await novaInstancia(OUTRO_JOGO);
    await expect(
      outra.cliente.salvarSessao({ ...r.pedido, operacao: "preparar" }),
    ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
    await expect(
      r.host.cliente.salvarSessao({ ...r.pedido, cerca: r.posse.cerca + 1, operacao: "preparar" }),
    ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
    expect(
      (
        await pedir("POST", `/api/interno/v1/mundos/${r.mundoId}/salvamento`, {
          token: r.aberta.token,
          corpo: { sid: r.sessao.sid, cerca: r.posse.cerca, operacao: "preparar" },
        })
      ).status,
    ).toBe(401);
    expect(
      (await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endedAt,
    ).toBeNull();
  });
  it("a capacidade da instância continua válida apenas dentro da margem real", async () => {
    const r = await preparar();
    const fim = new Date(Date.now() - 31_000);
    const inicio = new Date(fim.getTime() - 60_000);
    await db
      .update(games)
      .set({ lastRenewedAt: inicio, expiresAt: fim })
      .where(eq(games.id, r.sessao.sid));
    await db
      .update(permits)
      .set({
        createdAt: inicio,
        renewedAt: inicio,
        cutoffAt: fim,
        expiresAt: new Date(fim.getTime() + 30_000),
      })
      .where(eq(permits.sessionId, r.sessao.sid));
    await expect(r.iniciar()).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("concessão expirada permite apenas as duas fases dentro dos trinta segundos restantes", async () => {
    const r = await preparar();
    const fim = new Date(Date.now() - 1_000);
    const inicio = new Date(fim.getTime() - 60_000);
    await db
      .update(games)
      .set({ lastRenewedAt: inicio, expiresAt: fim })
      .where(eq(games.id, r.sessao.sid));
    await db
      .update(permits)
      .set({
        createdAt: inicio,
        renewedAt: inicio,
        cutoffAt: fim,
        expiresAt: new Date(fim.getTime() + 30_000),
      })
      .where(eq(permits.sessionId, r.sessao.sid));
    const preparada = await r.iniciar();
    expect(preparada.expiraEm).toBe(new Date(fim.getTime() + 30_000).toISOString());
    const foto = await r.foto(r.posse.revisao);
    expect((await r.concluir(foto.revisao)).estado).toBe("completed");
    expect((await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endReason).toBe(
      "expired",
    );
  });
  it("revogar o aparelho entre as fases impede a conclusão", async () => {
    const r = await preparar();
    await r.iniciar();
    const foto = await r.foto(r.posse.revisao);
    await db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(eq(devices.id, r.pessoa.ator.sessaoDeAparelhoId));
    await expect(r.concluir(foto.revisao)).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
    expect(
      (await db.select().from(permits).where(eq(permits.sessionId, r.sessao.sid)))[0]?.status,
    ).toBe("ready");
  });
  it("falha de auditoria reverte a preparação e permite repetir sem antecipar a prova", async () => {
    const r = await preparar();
    await db.execute(
      sql`create function audit.recusar_inicio_salvamento_mundo() returns trigger language plpgsql as $$ begin if new.event_type='recreio.game_session_ended' then raise exception 'audit unavailable'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_inicio_salvamento_mundo before insert on audit.events for each row execute function audit.recusar_inicio_salvamento_mundo()`,
    );
    try {
      await expect(r.iniciar()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
      expect(
        (await db.select().from(games).where(eq(games.id, r.sessao.sid)))[0]?.endedAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_inicio_salvamento_mundo on audit.events`);
      await db.execute(sql`drop function audit.recusar_inicio_salvamento_mundo()`);
    }
    await r.iniciar();
    const foto = await r.foto(r.posse.revisao);
    expect((await r.concluir(foto.revisao)).estado).toBe("completed");
  });
});
