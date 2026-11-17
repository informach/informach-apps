import { db, eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { sessaoDeJogoDoToken } from "@/features/sessao-de-jogo/service";
import { codigoDoPostgres } from "@/lib/repository";
import { novoJogador } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";

/** Modelo apenas: inserir um recibo não emite token nem autoriza um salvamento. */
async function base() {
  const pessoa = await novoJogador();
  const sessao = await sessaoDeJogoDoToken((await entrarNoJogo(pessoa)).token);
  const inicio = new Date();
  return {
    sessionId: sessao.sid,
    profileId: pessoa.perfil.id,
    policyVersion: sessao.versaoDaPolitica,
    mode: "profile" as const,
    createdAt: inicio,
    renewedAt: inicio,
    cutoffAt: new Date(inicio.getTime() + 60_000),
    expiresAt: new Date(inicio.getTime() + 90_000),
  };
}
async function recusa(pedido: typeof permits.$inferInsert) {
  try {
    await db.insert(permits).values(pedido);
    return null;
  } catch (erro) {
    return codigoDoPostgres(erro);
  }
}

describe("integridade da capacidade restrita de salvamento", () => {
  it("vincula o recibo ao mesmo SID e perfil, com versão positiva", async () => {
    const pedido = await base();
    const outra = await novoJogador();
    expect(await recusa({ ...pedido, profileId: outra.perfil.id })).toBe("23503");
    expect(await recusa({ ...pedido, policyVersion: 0 })).toBe("23514");
  });
  it("a margem é exatamente trinta segundos e não prolonga uma concessão indefinidamente", async () => {
    const pedido = await base();
    expect(
      await recusa({ ...pedido, expiresAt: new Date(pedido.cutoffAt.getTime() + 31_000) }),
    ).toBe("23514");
    expect(
      await recusa({
        ...pedido,
        cutoffAt: new Date(pedido.createdAt.getTime() + 901_000),
        expiresAt: new Date(pedido.createdAt.getTime() + 931_000),
      }),
    ).toBe("23514");
    expect(await recusa({ ...pedido, renewedAt: new Date(pedido.createdAt.getTime() - 1) })).toBe(
      "23514",
    );
  });
  it("uma conclusão exige instante, hash e recibos de revisão, sem aceitar NULL no CHECK", async () => {
    const pedido = await base();
    const concluido = {
      ...pedido,
      status: "completed" as const,
      reason: "manual" as const,
      requestHash: "a".repeat(64),
      results: [],
    };
    expect(await recusa(concluido)).toBe("23514");
    expect(await recusa({ ...concluido, finishedAt: pedido.createdAt, requestHash: null })).toBe(
      "23514",
    );
    expect(await recusa({ ...concluido, finishedAt: pedido.createdAt, results: null })).toBe(
      "23514",
    );
    expect(await recusa({ ...concluido, finishedAt: pedido.expiresAt })).toBe("23514");
    expect(await recusa({ ...concluido, finishedAt: pedido.createdAt })).toBeNull();
  });
  it("o navegador não pode substituir a prova de mundo por recibos de perfil", async () => {
    const pedido = await base();
    expect(
      await recusa({
        ...pedido,
        mode: "server",
        status: "completed",
        reason: "time",
        finishedAt: pedido.createdAt,
        requestHash: "a".repeat(64),
        results: [],
      }),
    ).toBe("23514");
    expect(
      await recusa({
        ...pedido,
        mode: "server",
        status: "conflicted",
        reason: "time",
        finishedAt: pedido.createdAt,
        requestHash: "a".repeat(64),
      }),
    ).toBe("23514");
    expect(await recusa({ ...pedido, status: "ready", results: [] })).toBe("23514");
  });
  it("expiração só pode ser registrada depois do prazo", async () => {
    const pedido = await base();
    expect(await recusa({ ...pedido, status: "expired", finishedAt: pedido.cutoffAt })).toBe(
      "23514",
    );
    expect(await recusa({ ...pedido, status: "expired", finishedAt: pedido.expiresAt })).toBeNull();
  });
  it("um SID tem um recibo; removê-lo não altera nem reabre a partida", async () => {
    const pedido = await base();
    const [antes] = await db.select().from(games).where(eq(games.id, pedido.sessionId));
    const [criado] = await db.insert(permits).values(pedido).returning();
    if (!criado) throw new Error("Recibo ausente");
    expect(await recusa(pedido)).toBe("23505");
    await db.delete(permits).where(eq(permits.id, criado.id));
    expect((await db.select().from(games).where(eq(games.id, pedido.sessionId)))[0]).toEqual(antes);
  });
});
