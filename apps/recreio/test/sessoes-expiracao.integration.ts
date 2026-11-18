import { and, db, eq, inArray, sql } from "@informach/db";
import { events, recreioGameSessions as sessions } from "@informach/db/schema";
import { beforeEach, describe, expect, it } from "vitest";
import {
  encerrarSessoesAbertas,
  encerrarSessoesVencidas,
  LOTE_DE_SESSOES_VENCIDAS,
} from "@/features/sessao-de-jogo/repository";
import { env } from "@/lib/env";
import { novoJogador } from "./apoio";
import { MORADA, novaInstancia } from "./jogo-apoio";
import { pedir } from "./rotas";

function sinal() {
  let resolver: (() => void) | undefined;
  const promessa = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return {
    promessa,
    liberar() {
      if (!resolver) throw new Error("Sinal ausente");
      resolver();
    },
  };
}

async function vencidas(quantidade: number) {
  const pessoas = await Promise.all(Array.from({ length: quantidade }, () => novoJogador()));
  const inicio = Date.now() - 86_400_000;
  const linhas = pessoas.map((pessoa, i) => ({
    id: crypto.randomUUID(),
    profileId: pessoa.perfil.id,
    deviceSessionId: pessoa.ator.sessaoDeAparelhoId,
    gameId: MORADA,
    expiresAt: new Date(inicio + i * 1000),
  }));
  await db.insert(sessions).values(linhas);
  return linhas;
}

async function ler(ids: string[]) {
  return db.select().from(sessions).where(inArray(sessions.id, ids));
}

async function auditoria(ids: string[]) {
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.eventType, "recreio.game_session_ended"),
        inArray(sql`${events.payload}->>'sessionId'`, ids),
      ),
    );
}

const rodar = () =>
  pedir("POST", "/api/jobs/manutencao", {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });

describe("expiração limitada das sessões", () => {
  beforeEach(async () => {
    // A rotina é global. Sessões de outras fixtures ainda válidas também
    // podem vencer durante a espera de trava deste teste. Cada caso cria
    // aqui todas as sessões abertas que pretende observar (inclusive válidas).
    // Somente no banco descartável e sem paralelismo de arquivos, impostos pela config.
    await db.transaction(async (tx) => {
      // Encerrar a autoridade das fixtures preserva agregados, presenças e o cursor.
      // A existência de referências técnicas não autoriza apagar a sessão.
      await encerrarSessoesAbertas(tx, sql`true`, "expired", { porQuem: "recreio" });
    });
  });

  it("retoma o lote mais antigo, conserva a sessão válida e entrega todos os encerramentos pelo cursor", async () => {
    const host = await novaInstancia();
    const inicio = await host.cliente.batimento({ mundos: [], cursor: null });
    const linhas = await vencidas(LOTE_DE_SESSOES_VENCIDAS + 2);
    const valida = linhas.at(-1);
    if (!valida) throw new Error("Sessão válida ausente");
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 86_400_000) })
      .where(eq(sessions.id, valida.id));
    const ids = linhas.map((l) => l.id);
    expect(await encerrarSessoesVencidas()).toBe(LOTE_DE_SESSOES_VENCIDAS);
    expect(
      (await ler(ids))
        .filter((l) => l.endedAt !== null)
        .map((l) => l.id)
        .sort(),
    ).toEqual(
      linhas
        .slice(0, LOTE_DE_SESSOES_VENCIDAS)
        .map((l) => l.id)
        .sort(),
    );
    expect(await encerrarSessoesVencidas()).toBe(1);
    expect(await encerrarSessoesVencidas()).toBe(0);
    expect((await ler([valida.id]))[0]?.endedAt).toBeNull();
    const encerradas = (await ler(ids)).filter((l) => l.endedAt !== null);
    expect(encerradas.every((l) => l.endReason === "expired")).toBe(true);
    expect(new Set(encerradas.map((l) => l.endedSeq)).size).toBe(LOTE_DE_SESSOES_VENCIDAS + 1);
    const avisos = await host.cliente.batimento({ mundos: [], cursor: inicio.cursor });
    expect(avisos.sessoesEncerradas.map((s) => s.sid).sort()).toEqual(
      linhas
        .slice(0, -1)
        .map((l) => l.id)
        .sort(),
    );
    expect(
      (await host.cliente.batimento({ mundos: [], cursor: avisos.cursor })).sessoesEncerradas,
    ).toEqual([]);
    const eventos = await auditoria(ids);
    expect(eventos).toHaveLength(LOTE_DE_SESSOES_VENCIDAS + 1);
    expect(new Set(eventos.map((e) => e.payload.sessionId)).size).toBe(eventos.length);
    expect(eventos.every((e) => e.actorId === null && e.payload.reason === "expired")).toBe(true);
  });

  it("não espera a renovação em curso nem encerra sua validade nova", async () => {
    const linhas = await vencidas(2);
    const primeira = linhas[0],
      segunda = linhas[1];
    if (!primeira || !segunda) throw new Error("Sessões ausentes");
    const travou = sinal(),
      soltar = sinal();
    const renovacao = db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + 86_400_000) })
        .where(eq(sessions.id, primeira.id));
      travou.liberar();
      await soltar.promessa;
    });
    try {
      await Promise.race([travou.promessa, renovacao]);
      expect(await encerrarSessoesVencidas()).toBe(1);
      expect((await ler([segunda.id]))[0]?.endReason).toBe("expired");
    } finally {
      soltar.liberar();
      await renovacao;
    }
    expect(await encerrarSessoesVencidas()).toBe(0);
    expect((await ler([primeira.id]))[0]?.endedAt).toBeNull();
    expect(await auditoria([primeira.id])).toEqual([]);
  });

  it("falha de auditoria reverte todo o lote e o HTTP registra falha; a repetição conclui uma vez", async () => {
    const linhas = await vencidas(2),
      ids = linhas.map((l) => l.id);
    await db.execute(sql`create function audit.recusar_expiracao_em_teste() returns trigger language plpgsql as $$
      begin if new.event_type = 'recreio.game_session_ended' then raise exception 'auditoria indisponível (teste)'; end if; return new; end $$`);
    await db.execute(
      sql`create trigger recusar_expiracao_em_teste before insert on audit.events for each row execute function audit.recusar_expiracao_em_teste()`,
    );
    try {
      expect(await rodar()).toMatchObject({
        status: 503,
        corpo: { status: "failed", incident: expect.any(String) },
      });
      expect((await ler(ids)).every((l) => l.endedAt === null && l.endedSeq === null)).toBe(true);
      expect(await auditoria(ids)).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_expiracao_em_teste on audit.events`);
      await db.execute(sql`drop function audit.recusar_expiracao_em_teste()`);
    }
    expect(await encerrarSessoesVencidas()).toBe(2);
    expect(await encerrarSessoesVencidas()).toBe(0);
    expect(await auditoria(ids)).toHaveLength(2);
  });

  it("não fica indefinidamente na trava do cursor e retoma depois do escritor confirmado", async () => {
    const host = await novaInstancia();
    const inicio = await host.cliente.batimento({ mundos: [], cursor: null });
    const linhas = await vencidas(2),
      primeira = linhas[0];
    if (!primeira) throw new Error("Sessão ausente");
    const travou = sinal(),
      soltar = sinal();
    const escritor = db.transaction(async (tx) => {
      await encerrarSessoesAbertas(tx, sql`${sessions.id} = ${primeira.id}`, "left", {
        porQuem: "conta",
      });
      travou.liberar();
      await soltar.promessa;
    });
    try {
      await Promise.race([travou.promessa, escritor]);
      expect(await rodar()).toMatchObject({
        status: 503,
        corpo: { status: "failed", incident: expect.any(String) },
      });
    } finally {
      soltar.liberar();
      await escritor;
    }
    expect(await encerrarSessoesVencidas()).toBe(1);
    expect(await encerrarSessoesVencidas()).toBe(0);
    expect(await auditoria(linhas.map((l) => l.id))).toHaveLength(2);
    const avisos = await host.cliente.batimento({ mundos: [], cursor: inicio.cursor });
    expect(avisos.sessoesEncerradas).toEqual([
      { sid: primeira.id, motivo: "left" },
      ...linhas.slice(1).map((linha) => ({ sid: linha.id, motivo: "expired" })),
    ]);
  });
});
