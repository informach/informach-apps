import { db, eq, sql } from "@informach/db";
import { recreioDeviceSessions as devices, sessions } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { novoJogador } from "./apoio";
import { entrarNoJogo, MORADA } from "./jogo-apoio";
import { pedir } from "./rotas";

describe("mundos exigem autoridade atual além da assinatura", () => {
  it("login removido não conserva a listagem com o token ainda não vencido", async () => {
    const pessoa = await novoJogador();
    const jogo = await entrarNoJogo(pessoa);
    await db.delete(sessions).where(eq(sessions.id, pessoa.login.authSessionId));
    expect(
      (await pedir("GET", `/api/sdk/v1/mundos?jogo=${MORADA}`, { token: jogo.token })).status,
    ).toBe(401);
  });

  it("aparelho que vence não pode criar mundo com a sessão de jogo ainda aberta", async () => {
    const pessoa = await novoJogador();
    const jogo = await entrarNoJogo(pessoa);
    await db
      .update(devices)
      .set({ expiresAt: sql`clock_timestamp()-interval '1 second'` })
      .where(eq(devices.id, pessoa.ator.sessaoDeAparelhoId));
    expect(
      (
        await pedir("POST", "/api/sdk/v1/mundos", {
          token: jogo.token,
          corpo: { nome: "Não deve ser criado" },
        })
      ).status,
    ).toBe(401);
  });
});
