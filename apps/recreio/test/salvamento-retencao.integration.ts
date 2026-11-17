import { db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { apagarSalvamentosAntigos } from "@/features/manutencao/repository";
import { novoJogador, sinal } from "./apoio";

describe("retenção física dos recibos de salvamento", () => {
  it("expurga lotes de 500, pula recibo travado e conserva o recente e as sessões", async () => {
    const pessoa = await novoJogador();
    const antigo = new Date(Date.now() - 2 * 86_400_000);
    const recente = new Date();
    const sessoes = await db
      .insert(games)
      .values(
        Array.from({ length: 502 }, (_, indice) => {
          const inicio = indice === 501 ? recente : antigo;
          return {
            profileId: pessoa.perfil.id,
            deviceSessionId: pessoa.ator.sessaoDeAparelhoId,
            gameId: "perfil-teste",
            startedAt: inicio,
            lastRenewedAt: inicio,
            expiresAt: new Date(inicio.getTime() + 60_000),
            endedAt: inicio,
            endReason: "left" as const,
            endedSeq: sql`nextval('recreio.game_session_end_seq')`,
          };
        }),
      )
      .returning();
    const recibos = await db
      .insert(permits)
      .values(
        sessoes.map((sessao) => {
          const inicio = sessao.startedAt;
          return {
            sessionId: sessao.id,
            profileId: pessoa.perfil.id,
            policyVersion: 1,
            mode: "profile" as const,
            createdAt: inicio,
            renewedAt: inicio,
            cutoffAt: sessao.expiresAt,
            expiresAt: new Date(sessao.expiresAt.getTime() + 30_000),
          };
        }),
      )
      .returning();
    const travado = recibos.find((recibo) => recibo.createdAt.getTime() === antigo.getTime());
    const atual = recibos.find((recibo) => recibo.createdAt.getTime() === recente.getTime());
    if (!travado || !atual) throw new Error("Recibos ausentes");
    const entrou = sinal<void>();
    const liberar = sinal<void>();
    const bloqueio = db.transaction(async (tx) => {
      await tx.select().from(permits).where(eq(permits.id, travado.id)).for("update");
      entrou.concluir();
      await liberar.promessa;
    });
    await entrou.promessa;
    try {
      expect(await apagarSalvamentosAntigos()).toBe(500);
      expect(await apagarSalvamentosAntigos()).toBe(0);
    } finally {
      liberar.concluir();
      await bloqueio;
    }
    expect(await apagarSalvamentosAntigos()).toBe(1);
    expect(await apagarSalvamentosAntigos()).toBe(0);
    expect(await db.select().from(permits).where(eq(permits.profileId, pessoa.perfil.id))).toEqual([
      atual,
    ]);
    expect(
      await db.select().from(games).where(eq(games.profileId, pessoa.perfil.id)).orderBy(games.id),
    ).toEqual(sessoes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  });
});
