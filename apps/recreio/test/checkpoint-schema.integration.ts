import { db, eq } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import {
  emitirIngresso,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { codigoDoPostgres } from "@/lib/repository";
import { novoJogador } from "./apoio";
import { claimsDe } from "./jogo-apoio";

/** Somente constraints/barreira. Não representa execução de um checkpoint pelo jogo. */
async function intencao() {
  const pessoa = await novoJogador();
  const primeiro = await emitirIngresso(pessoa.ator, { jogo: "morada" });
  const aberta = await trocarIngresso({ ingresso: primeiro.ingresso });
  const sessao = await sessaoDeJogoDoToken(aberta.token);
  const proximo = await emitirIngresso(pessoa.ator, { jogo: "morada" });
  const inicio = new Date();
  return {
    profileId: pessoa.perfil.id,
    fromSessionId: sessao.sid,
    toDeviceSessionId: pessoa.ator.sessaoDeAparelhoId,
    ticketJti: String(claimsDe(proximo.ingresso).jti),
    policyVersion: sessao.versaoDaPolitica,
    mode: "profile" as const,
    requestedAt: inicio,
    expiresAt: new Date(inicio.getTime() + 30_000),
  };
}

async function codigoDaRecusa(pedido: typeof handoffs.$inferInsert) {
  try {
    await db.insert(handoffs).values(pedido);
    return null;
  } catch (erro) {
    return codigoDoPostgres(erro);
  }
}

describe("integridade da intenção de checkpoint", () => {
  it("o SID anterior precisa pertencer ao perfil da intenção", async () => {
    const base = await intencao();
    const outro = await novoJogador();
    expect(await codigoDaRecusa({ ...base, profileId: outro.perfil.id })).toBe("23503");
  });
  it("recusa prazo maior que um minuto e confirmação de servidor sem prova", async () => {
    const base = await intencao();
    expect(
      await codigoDaRecusa({ ...base, expiresAt: new Date(base.requestedAt.getTime() + 61_000) }),
    ).toBe("23514");
    expect(
      await codigoDaRecusa({
        ...base,
        mode: "server",
        status: "confirmed",
        confirmedAt: base.requestedAt,
      }),
    ).toBe("23514");
  });
  it("remover a intenção técnica conserva a barreira independente no SID", async () => {
    const base = await intencao();
    const [pedido] = await db
      .insert(handoffs)
      .values({ ...base, status: "confirmed", confirmedAt: base.requestedAt })
      .returning({ id: handoffs.id });
    if (!pedido) throw new Error("Intenção ausente");
    await db
      .update(games)
      .set({ checkpointFrozenAt: base.requestedAt })
      .where(eq(games.id, base.fromSessionId));
    await db.delete(handoffs).where(eq(handoffs.id, pedido.id));
    expect(
      (await db.select().from(games).where(eq(games.id, base.fromSessionId)))[0]
        ?.checkpointFrozenAt,
    ).toEqual(base.requestedAt);
  });
});
