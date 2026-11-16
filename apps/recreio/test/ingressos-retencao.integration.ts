import { db, eq, inArray, lt, sql } from "@informach/db";
import { recreioGameTickets as tickets } from "@informach/db/schema";
import { beforeEach, describe, expect, it } from "vitest";
import {
  apagarIngressosAntigos,
  LOTE_DE_INGRESSOS_ANTIGOS,
} from "@/features/sessao-de-jogo/repository";
import { env } from "@/lib/env";
import { novoJogador } from "./apoio";
import { MORADA } from "./jogo-apoio";
import { pedir } from "./rotas";

function sinal() {
  let liberar: (() => void) | undefined;
  const promessa = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  return {
    promessa,
    liberar() {
      if (!liberar) throw new Error("Sinal não iniciado");
      liberar();
    },
  };
}

async function ingressos(quantidade: number) {
  const pessoa = await novoJogador();
  const inicio = Date.now() - 3 * 86_400_000;
  const linhas = Array.from({ length: quantidade }, (_, n) => ({
    jti: crypto.randomUUID(),
    profileId: pessoa.perfil.id,
    deviceSessionId: pessoa.ator.sessaoDeAparelhoId,
    gameId: MORADA,
    issuedAt: new Date(inicio + n - 60_000),
    expiresAt: new Date(inicio + n),
    consumedAt: n % 2 === 0 ? new Date(inicio + n - 30_000) : null,
  }));
  await db.insert(tickets).values(linhas);
  return linhas;
}

describe("retenção limitada dos ingressos", () => {
  beforeEach(async () => {
    // Somente no banco descartável obrigatório deste config: separar as sobras
    // de outras jornadas das linhas cuja ordem/quantidade esta prova acompanha.
    await db.delete(tickets).where(lt(tickets.expiresAt, sql`now() - interval '1 day'`));
  });

  it("limita o lote, prioriza os mais antigos e conserva ingressos recentes e válidos", async () => {
    const linhas = await ingressos(LOTE_DE_INGRESSOS_ANTIGOS + 3);
    const base = linhas[0];
    if (!base) throw new Error("Ingresso de prova ausente");
    const recentes = [
      { ...base, jti: crypto.randomUUID(), expiresAt: new Date(Date.now() - 60_000) },
      {
        ...base,
        jti: crypto.randomUUID(),
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    await db.insert(tickets).values(recentes);
    expect(await apagarIngressosAntigos()).toBe(LOTE_DE_INGRESSOS_ANTIGOS);
    const restantes = await db
      .select({ jti: tickets.jti })
      .from(tickets)
      .where(eq(tickets.profileId, base.profileId));
    expect(restantes.map((linha) => linha.jti).sort()).toEqual(
      [...linhas.slice(-3), ...recentes].map((linha) => linha.jti).sort(),
    );
    expect(await apagarIngressosAntigos()).toBe(3);
    expect(await apagarIngressosAntigos()).toBe(0);
    expect(
      await db
        .select({ jti: tickets.jti })
        .from(tickets)
        .where(eq(tickets.profileId, base.profileId)),
    ).toHaveLength(2);
  });

  it("duas execuções não esperam ingressos travados nem removem o mesmo lote duas vezes", async () => {
    const linhas = await ingressos(750);
    const protegidos = linhas.slice(0, 250).map((linha) => linha.jti);
    const travou = sinal(),
      soltar = sinal();
    const trava = db.transaction(async (tx) => {
      await tx.select().from(tickets).where(inArray(tickets.jti, protegidos)).for("update");
      travou.liberar();
      await soltar.promessa;
    });
    try {
      await Promise.race([travou.promessa, trava]);
      const contagens = await Promise.all([apagarIngressosAntigos(), apagarIngressosAntigos()]);
      expect(contagens.every((n) => n >= 0 && n <= LOTE_DE_INGRESSOS_ANTIGOS)).toBe(true);
      expect(contagens.reduce((total, n) => total + n, 0)).toBe(500);
      expect(
        await db.select({ jti: tickets.jti }).from(tickets).where(inArray(tickets.jti, protegidos)),
      ).toHaveLength(250);
    } finally {
      soltar.liberar();
      await trava;
    }
    expect(await apagarIngressosAntigos()).toBe(250);
    expect(await apagarIngressosAntigos()).toBe(0);
  });

  it("erro de exclusão falha o HTTP, preserva as linhas e permite continuar depois", async () => {
    const linhas = await ingressos(2);
    await db.execute(sql`
      create function recreio.recusar_limpeza_em_teste() returns trigger language plpgsql as $$
      begin raise exception 'exclusão indisponível (teste)'; end $$
    `);
    await db.execute(sql`
      create trigger recusar_limpeza_em_teste before delete on recreio.game_tickets
      for each row execute function recreio.recusar_limpeza_em_teste()
    `);
    try {
      expect(
        await pedir("POST", "/api/jobs/manutencao", {
          headers: { authorization: `Bearer ${env.CRON_SECRET}` },
        }),
      ).toMatchObject({ status: 503, corpo: { status: "failed", incident: expect.any(String) } });
      expect(
        await db
          .select({ jti: tickets.jti })
          .from(tickets)
          .where(
            inArray(
              tickets.jti,
              linhas.map((linha) => linha.jti),
            ),
          ),
      ).toHaveLength(2);
    } finally {
      await db.execute(sql`drop trigger recusar_limpeza_em_teste on recreio.game_tickets`);
      await db.execute(sql`drop function recreio.recusar_limpeza_em_teste()`);
    }
    expect(await apagarIngressosAntigos()).toBe(2);
    expect(await apagarIngressosAntigos()).toBe(0);
  });
});
