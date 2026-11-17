import { randomBytes } from "node:crypto";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioSpaceSnapshots as snapshots,
} from "@informach/db/schema";
import { ControleDaSessaoSchema } from "@informach/recreio/contrato";
import { describe, expect, it, vi } from "vitest";
import { selecionarPerfil } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import {
  emitirIngresso,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { aposentarInstancias, loginReal, novoJogador } from "./apoio";
import { abrirPelaRota, entrarNoJogo, mundoDe, novaInstancia, OUTRO_JOGO } from "./jogo-apoio";
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
      nome: "Mundo com checkpoint",
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
  const anterior = await entrarNoJogo(pessoa, OUTRO_JOGO);
  const host = await novaInstancia(OUTRO_JOGO);
  expect((await abrirPelaRota(anterior, mundoId)).status).toBe(200);
  const posse = await host.cliente.reivindicarPosse(mundoId);
  await host.cliente.verificarEntrada({
    mundoId,
    cerca: posse.cerca,
    sid: anterior.sid,
    perfilId: pessoa.perfil.id,
  });
  const fotografia = (revisaoEsperada: number, diarioSeq = 0) =>
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
  const antiga = await fotografia(posse.revisao);
  const login = await loginReal(pessoa.conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("Aparelho ausente");
  await selecionarPerfil(contexto.ator, pessoa.perfil.id);
  const ingresso = await emitirIngresso(
    { ...contexto.ator, perfil: pessoa.perfil },
    { jogo: OUTRO_JOGO },
  );
  const pedido = {
    ingresso: ingresso.ingresso,
    continuarAqui: true,
    chaveDeTroca: randomBytes(32).toString("base64url"),
  };
  await expect(trocarIngresso(pedido)).rejects.toMatchObject({
    codigo: "CHECKPOINT_PENDENTE",
    detalhe: { motivo: "requested" },
  });
  const controle = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: anterior.token });
  const estado = ControleDaSessaoSchema.parse(controle.corpo);
  if (estado.checkpoint?.modo !== "server") throw new Error("Intenção de servidor ausente");
  const id = estado.checkpoint.id;
  const prova = (revisao: number, diarioSeq = 0) => ({
    id,
    sid: anterior.sid,
    mundoId,
    cerca: posse.cerca,
    confirmado: true as const,
    revisao,
    diarioSeq,
  });
  return { pessoa, mundoId, anterior, host, posse, antiga, fotografia, pedido, id, prova };
}

describe("checkpoint do mundo autenticado pela posse", () => {
  it("bytes corrompidos com o mesmo tamanho não se tornam uma confirmação durável", async () => {
    const r = await preparar();
    const foto = await r.fotografia(r.antiga.revisao);
    await db
      .update(snapshots)
      .set({ data: Buffer.from(JSON.stringify({ contador: 9 })) })
      .where(and(eq(snapshots.spaceId, r.mundoId), eq(snapshots.revision, foto.revisao)));
    await expect(r.host.cliente.confirmarCheckpoint(r.prova(foto.revisao))).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
    ).toBeNull();
    const valida = await r.fotografia(foto.revisao);
    expect(await r.host.cliente.confirmarCheckpoint(r.prova(valida.revisao))).toMatchObject({
      estado: "confirmed",
    });
  });
  it("recusa foto anterior ao pedido; prova atual congela e permite a abertura no destinatário", async () => {
    const r = await preparar();
    await expect(
      r.host.cliente.confirmarCheckpoint(r.prova(r.antiga.revisao)),
    ).rejects.toMatchObject({ codigo: "CHECKPOINT_NECESSARIO" });
    const foto = await r.fotografia(r.antiga.revisao);
    expect(await r.host.cliente.confirmarCheckpoint(r.prova(foto.revisao))).toEqual({
      estado: "confirmed",
      pausada: true,
    });
    expect((await db.select().from(handoffs).where(eq(handoffs.id, r.id)))[0]).toMatchObject({
      status: "confirmed",
      mode: "server",
      checkpointSpaceId: r.mundoId,
      checkpointFence: r.posse.cerca,
      checkpointRevision: foto.revisao,
      checkpointJournalSeq: 0,
    });
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
    ).not.toBeNull();
    const nova = await trocarIngresso(r.pedido);
    const atual = await sessaoDeJogoDoToken(nova.token);
    expect((await abrirPelaRota({ sid: atual.sid, token: nova.token }, r.mundoId)).status).toBe(
      200,
    );
    expect((await db.select().from(handoffs).where(eq(handoffs.id, r.id)))[0]?.status).toBe(
      "completed",
    );
    expect(
      (
        await pedir("POST", "/api/sdk/v1/sessao/checkpoint", {
          token: r.anterior.token,
          corpo: { id: r.id, confirmado: true },
        })
      ).status,
    ).toBe(403);
  });
  it("foto que ainda não cobre o diário não confirma; ACK repetido não exige congelar os demais jogadores", async () => {
    const r = await preparar();
    const foto = await r.fotografia(r.antiga.revisao);
    await r.host.cliente.anexarAoDiario({
      mundoId: r.mundoId,
      cerca: r.posse.cerca,
      entradas: [{ seq: 1, tick: 1, fatoId: crypto.randomUUID(), bytes: new Uint8Array([1]) }],
    });
    await expect(r.host.cliente.confirmarCheckpoint(r.prova(foto.revisao))).rejects.toMatchObject({
      codigo: "CHECKPOINT_NECESSARIO",
    });
    const atual = await r.fotografia(foto.revisao, 1);
    const prova = r.prova(atual.revisao, 1);
    expect(await r.host.cliente.confirmarCheckpoint(prova)).toMatchObject({ estado: "confirmed" });
    // Outro jogador pode continuar depois do checkpoint deste perfil.
    await r.host.cliente.anexarAoDiario({
      mundoId: r.mundoId,
      cerca: r.posse.cerca,
      entradas: [{ seq: 2, tick: 2, fatoId: crypto.randomUUID(), bytes: new Uint8Array([2]) }],
    });
    expect(await r.host.cliente.confirmarCheckpoint(prova)).toMatchObject({ estado: "confirmed" });
    await expect(
      r.host.cliente.confirmarCheckpoint({ ...prova, diarioSeq: 2 }),
    ).rejects.toMatchObject({ codigo: "SEM_PERMISSAO" });
  });
  it("outra instância, cerca antiga ou ACK de navegador não podem fabricar a prova", async () => {
    const r = await preparar();
    const foto = await r.fotografia(r.antiga.revisao);
    const outra = await novaInstancia(OUTRO_JOGO);
    await expect(outra.cliente.confirmarCheckpoint(r.prova(foto.revisao))).rejects.toMatchObject({
      codigo: "POSSE_PERDIDA",
    });
    await expect(
      r.host.cliente.confirmarCheckpoint({ ...r.prova(foto.revisao), cerca: r.posse.cerca + 1 }),
    ).rejects.toMatchObject({ codigo: "POSSE_PERDIDA" });
    const outroJogo = await novaInstancia("morada");
    await expect(
      outroJogo.cliente.confirmarCheckpoint(r.prova(foto.revisao)),
    ).rejects.toMatchObject({ codigo: "NAO_ENCONTRADO" });
    const navegador = await pedir("POST", "/api/sdk/v1/sessao/checkpoint", {
      token: r.anterior.token,
      corpo: { id: r.id, confirmado: true },
    });
    expect(navegador).toEqual({ status: 403, corpo: { codigo: "SEM_PERMISSAO" } });
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
    ).toBeNull();
    expect((await db.select().from(handoffs).where(eq(handoffs.id, r.id)))[0]?.status).toBe(
      "requested",
    );
  });
  it("falha de auditoria reverte barreira e prova; repetir a prova válida depois confirma", async () => {
    const r = await preparar();
    const foto = await r.fotografia(r.antiga.revisao);
    await db.execute(sql`create function audit.recusar_checkpoint_host_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.session_handoff_confirmed' then raise exception 'auditoria host indisponivel'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_checkpoint_host_em_teste before insert on audit.events for each row execute function audit.recusar_checkpoint_host_em_teste()`,
    );
    try {
      await expect(r.host.cliente.confirmarCheckpoint(r.prova(foto.revisao))).rejects.toMatchObject(
        { codigo: "INDISPONIVEL" },
      );
      expect((await db.select().from(handoffs).where(eq(handoffs.id, r.id)))[0]).toMatchObject({
        status: "requested",
        checkpointSpaceId: null,
      });
      expect(
        (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_checkpoint_host_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_checkpoint_host_em_teste()`);
    }
    expect(await r.host.cliente.confirmarCheckpoint(r.prova(foto.revisao))).toMatchObject({
      estado: "confirmed",
    });
  });
});
