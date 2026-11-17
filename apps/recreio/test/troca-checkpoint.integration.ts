import { randomBytes } from "node:crypto";
import { AuditPersistenceError } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import { ControleDaSessaoSchema } from "@informach/recreio/contrato";
import { describe, expect, it, vi } from "vitest";
import { alterarDados, consultarDados } from "@/features/dados-de-perfil/service";
import { selecionarPerfil } from "@/features/perfis/service";
import { resolverAtor } from "@/features/sessao/service";
import { lerControleDaSessao } from "@/features/sessao-de-jogo/controle-repository";
import {
  emitirIngresso,
  renovarSessao,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { eventosCom, loginReal, novoJogador } from "./apoio";
import { claimsDe } from "./jogo-apoio";
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
      id: "checkpoint-perfil",
      nome: "Checkpoint",
      rota: "/jogar/checkpoint-perfil",
      capacidades: {
        ...real.JOGOS[0].capacidades,
        mundos: null,
        posse: [],
        dadosDePerfil: true,
        checkpoint: "perfil",
      },
    },
  ];
  return {
    ...real,
    JOGOS: jogos,
    jogoPorId: (id: string) => jogos.find((j) => j.id === id) ?? null,
  };
});
const JOGO = "checkpoint-perfil";
const gravacao = { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "MQ==" };

async function preparar(jogo = JOGO) {
  const pessoa = await novoJogador();
  const primeiro = await emitirIngresso(pessoa.ator, { jogo });
  const aberta = await trocarIngresso({ ingresso: primeiro.ingresso });
  const anterior = await sessaoDeJogoDoToken(aberta.token);
  const login = await loginReal(pessoa.conta);
  const contexto = await resolverAtor(login);
  if (!contexto) throw new Error("Aparelho ausente");
  await selecionarPerfil(contexto.ator, pessoa.perfil.id);
  const novoAtor = { ...contexto.ator, perfil: pessoa.perfil };
  const ingresso = await emitirIngresso(novoAtor, { jogo });
  const pedido = {
    ingresso: ingresso.ingresso,
    continuarAqui: true,
    chaveDeTroca: randomBytes(32).toString("base64url"),
  };
  return { pessoa, aberta, anterior, novoAtor, pedido };
}
async function pedirTroca(r: Awaited<ReturnType<typeof preparar>>) {
  await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({
    codigo: "CHECKPOINT_PENDENTE",
    detalhe: { motivo: "requested" },
  });
  const controle = await pedir("GET", "/api/sdk/v1/sessao/controle", { token: r.aberta.token });
  expect(controle.status).toBe(200);
  const estado = ControleDaSessaoSchema.parse(controle.corpo);
  if (!estado.checkpoint) throw new Error("Intenção ausente");
  return estado.checkpoint.id;
}
function confirmar(r: Awaited<ReturnType<typeof preparar>>, id: string, confirmado = true) {
  return pedir("POST", "/api/sdk/v1/sessao/checkpoint", {
    token: r.aberta.token,
    corpo: { id, confirmado },
  });
}

describe("troca coordenada por checkpoint de perfil", () => {
  it.each(["confirmed", "completed"] as const)(
    "espera da auditoria não pode atravessar o prazo da troca em %s",
    async (fase) => {
      const r = await preparar();
      const id = await pedirTroca(r);
      if (fase === "completed") expect(await confirmar(r, id)).toMatchObject({ status: 200 });
      await db
        .update(handoffs)
        .set({ expiresAt: sql`clock_timestamp()+interval '3 seconds'` })
        .where(eq(handoffs.id, id));
      // A auditoria espera exatamente o prazo persistido, sem substituir o relógio do servidor.
      await db.execute(sql`create function audit.esperar_prazo_troca_em_teste() returns trigger language plpgsql as $$
      declare limite timestamptz;
      begin if new.event_type in ('recreio.session_handoff_confirmed','recreio.session_handoff_completed') then
        select expires_at into limite from recreio.session_handoffs where id=(new.payload->>'handoffId')::uuid;
        perform pg_sleep(greatest(0,extract(epoch from (limite-clock_timestamp())))+0.01);
      end if; return new; end $$`);
      await db.execute(
        sql`create trigger esperar_prazo_troca_em_teste before insert on audit.events for each row execute function audit.esperar_prazo_troca_em_teste()`,
      );
      try {
        if (fase === "confirmed")
          expect(await confirmar(r, id)).toMatchObject({
            status: 409,
            corpo: { codigo: "CHECKPOINT_PENDENTE", motivo: "expired" },
          });
        else
          await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({
            codigo: "CHECKPOINT_PENDENTE",
            detalhe: { motivo: "expired" },
          });
        const [pedido] = await db.select().from(handoffs).where(eq(handoffs.id, id));
        expect(pedido?.status).toBe(fase === "confirmed" ? "requested" : "confirmed");
        const [antiga] = await db.select().from(games).where(eq(games.id, r.anterior.sid));
        expect(antiga?.endedAt).toBeNull();
        if (fase === "confirmed") expect(antiga?.checkpointFrozenAt).toBeNull();
        else expect(antiga?.checkpointFrozenAt).not.toBeNull();
        expect(
          (
            await db
              .select()
              .from(tickets)
              .where(eq(tickets.jti, String(claimsDe(r.pedido.ingresso).jti)))
          )[0]?.consumedAt,
        ).toBeNull();
      } finally {
        await db.execute(sql`drop trigger esperar_prazo_troca_em_teste on audit.events`);
        await db.execute(sql`drop function audit.esperar_prazo_troca_em_teste()`);
      }
    },
  );
  it("espera a fila, conserva o progresso, congela o SID anterior e só então abre no outro aparelho", async () => {
    const r = await preparar();
    const id = await pedirTroca(r);
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({ codigo: "CHECKPOINT_PENDENTE" });
    expect(
      await db.select().from(handoffs).where(eq(handoffs.profileId, r.pessoa.perfil.id)),
    ).toHaveLength(1);
    expect(
      (
        await db
          .select()
          .from(tickets)
          .where(eq(tickets.jti, String(claimsDe(r.pedido.ingresso).jti)))
      )[0]?.consumedAt,
    ).toBeNull();
    await alterarDados(r.anterior, gravacao);
    expect(await confirmar(r, id)).toMatchObject({
      status: 200,
      corpo: { estado: "confirmed", pausada: true },
    });
    expect(await confirmar(r, id)).toMatchObject({
      status: 200,
      corpo: { estado: "confirmed", pausada: true },
    });
    await expect(alterarDados(r.anterior, { ...gravacao, revisao: 1 })).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "checkpoint" },
    });
    await expect(renovarSessao(r.aberta.token)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    const outroIngresso = await emitirIngresso(r.novoAtor, { jogo: JOGO });
    await expect(
      trocarIngresso({ ...r.pedido, ingresso: outroIngresso.ingresso }),
    ).rejects.toMatchObject({ codigo: "CHECKPOINT_PENDENTE" });
    const nova = await trocarIngresso(r.pedido);
    const atual = await sessaoDeJogoDoToken(nova.token);
    expect(atual.sid).not.toBe(r.anterior.sid);
    expect((await consultarDados(atual, "pontos", false)).versao?.conteudo).toBe("MQ==");
    expect((await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]).toMatchObject({
      endReason: "replaced",
    });
    // A referência foi conferida antes da troca; a leitura sob trava chega depois.
    await expect(lerControleDaSessao(r.anterior)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
      detalhe: { motivo: "replaced" },
    });
    expect((await db.select().from(handoffs).where(eq(handoffs.id, id)))[0]?.status).toBe(
      "completed",
    );
    const repetida = await trocarIngresso(r.pedido);
    expect((await sessaoDeJogoDoToken(repetida.token)).sid).toBe(atual.sid);
    expect((await eventosCom("handoffId", id)).map((e) => e.eventType)).toEqual([
      "recreio.session_handoff_requested",
      "recreio.session_handoff_confirmed",
      "recreio.session_handoff_completed",
    ]);
  });
  it("ACK negado não congela nem autoriza a tomada da partida", async () => {
    const r = await preparar();
    const id = await pedirTroca(r);
    expect(await confirmar(r, id, false)).toMatchObject({
      status: 200,
      corpo: { estado: "failed", pausada: false },
    });
    expect(await confirmar(r, id)).toMatchObject({
      status: 200,
      corpo: { estado: "failed", pausada: false },
    });
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({
      codigo: "CHECKPOINT_PENDENTE",
      detalhe: { motivo: "failed" },
    });
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
    ).toBeNull();
    await alterarDados(r.anterior, gravacao);
  });
  it("prazo vencido e SID de outro perfil não podem confirmar a intenção", async () => {
    const r = await preparar();
    const id = await pedirTroca(r);
    const outro = await preparar();
    expect(await confirmar(outro, id)).toMatchObject({
      status: 403,
      corpo: { codigo: "SEM_PERMISSAO" },
    });
    await db
      .update(handoffs)
      .set({ requestedAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(handoffs.id, id));
    expect(await confirmar(r, id)).toMatchObject({
      status: 200,
      corpo: { estado: "expired", pausada: false },
    });
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({
      codigo: "CHECKPOINT_PENDENTE",
      detalhe: { motivo: "expired" },
    });
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
    ).toBeNull();
  });
  it("mundo não ganha prova de servidor por ACK do navegador", async () => {
    const r = await preparar("morada");
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({
      codigo: "CHECKPOINT_PENDENTE",
      detalhe: { motivo: "manual" },
    });
    expect(await confirmar(r, crypto.randomUUID())).toMatchObject({
      status: 403,
      corpo: { codigo: "SEM_PERMISSAO" },
    });
    expect(
      await db.select().from(handoffs).where(eq(handoffs.profileId, r.pessoa.perfil.id)),
    ).toEqual([]);
    expect(
      (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.endedAt,
    ).toBeNull();
  });
  it("falha da auditoria reverte intenção e barreira, sem aceitar confirmação parcial", async () => {
    const r = await preparar();
    await db.execute(sql`create function audit.recusar_troca_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type in ('recreio.session_handoff_requested','recreio.session_handoff_confirmed') then
      raise exception 'auditoria de troca indisponivel (teste)'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_troca_em_teste before insert on audit.events for each row execute function audit.recusar_troca_em_teste()`,
    );
    try {
      await expect(trocarIngresso(r.pedido)).rejects.toBeInstanceOf(AuditPersistenceError);
      expect(
        await db.select().from(handoffs).where(eq(handoffs.profileId, r.pessoa.perfil.id)),
      ).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_troca_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_troca_em_teste()`);
    }
    const id = await pedirTroca(r);
    await db.execute(sql`create function audit.recusar_ack_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type='recreio.session_handoff_confirmed' then raise exception 'ACK indisponivel (teste)'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_ack_em_teste before insert on audit.events for each row execute function audit.recusar_ack_em_teste()`,
    );
    try {
      expect(await confirmar(r, id)).toMatchObject({ status: 503 });
      expect((await db.select().from(handoffs).where(eq(handoffs.id, id)))[0]?.status).toBe(
        "requested",
      );
      expect(
        (await db.select().from(games).where(eq(games.id, r.anterior.sid)))[0]?.checkpointFrozenAt,
      ).toBeNull();
    } finally {
      await db.execute(sql`drop trigger recusar_ack_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_ack_em_teste()`);
    }
    expect(await confirmar(r, id)).toMatchObject({ status: 200, corpo: { estado: "confirmed" } });
  });
});
