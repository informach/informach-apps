import { db, eq, sql } from "@informach/db";
import {
  recreioFriendCodes as codes,
  recreioGameSessions as games,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  sessions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { sessaoDeJogoDoToken } from "@/features/sessao-de-jogo/service";
import { comJogadorSocial } from "@/features/social/autoridade-repository";
import { emitirCodigoDeAmigo, pedirAmizade } from "@/features/social/service";
import { novoJogador } from "./apoio";
import { entrarNoJogo } from "./jogo-apoio";
import { familiaSocial, referenciaSocial as ref } from "./social-apoio";

async function abrir() {
  const jogador = await novoJogador();
  const jogo = await entrarNoJogo(jogador);
  return { jogador, jogo, sessao: await sessaoDeJogoDoToken(jogo.token) };
}

describe("social de partida conserva toda a autoridade do SID", () => {
  it("emite por partida atual, mas uma sessão encerrada não vira identidade de portal", async () => {
    const r = await abrir();
    await emitirCodigoDeAmigo(r.sessao);
    await db.transaction((tx) =>
      encerrarSessoesAbertas(tx, sql`${games.id}=${r.sessao.sid}`, "left", { porQuem: "conta" }),
    );
    await expect(emitirCodigoDeAmigo(r.sessao)).rejects.toMatchObject({
      codigo: "SESSAO_ENCERRADA",
    });
    expect(
      await db.select().from(codes).where(eq(codes.profileId, r.jogador.perfil.id)),
    ).toHaveLength(1);
    await emitirCodigoDeAmigo(ref(r.jogador));
    expect(
      await db.select().from(codes).where(eq(codes.profileId, r.jogador.perfil.id)),
    ).toHaveLength(2);
  });
  it.each(["login", "politica", "cobertura"] as const)(
    "perder %s recusa o SID antes da escrita social",
    async (causa) => {
      const r = await abrir();
      if (causa === "login")
        await db.delete(sessions).where(eq(sessions.id, r.jogador.login.authSessionId));
      if (causa === "politica")
        await db
          .update(profiles)
          .set({ policyVersion: 2 })
          .where(eq(profiles.id, r.jogador.perfil.id));
      if (causa === "cobertura")
        await db
          .update(profiles)
          .set({ coverageEnabled: false })
          .where(eq(profiles.id, r.jogador.perfil.id));
      await expect(emitirCodigoDeAmigo(r.sessao)).rejects.toMatchObject({
        codigo: causa === "cobertura" ? "ACESSO_PERDIDO" : "SESSAO_INVALIDA",
      });
      expect(
        await db.select().from(codes).where(eq(codes.profileId, r.jogador.perfil.id)),
      ).toHaveLength(0);
    },
  );
  it("prazo conservador do token também vence durante a transação social", async () => {
    const r = await abrir();
    await expect(
      comJogadorSocial({ ...r.sessao, expiraEm: Date.now() + 1000 }, null, async (tx) => {
        await tx.execute(sql`select pg_sleep(1.1)`);
        return true;
      }),
    ).rejects.toMatchObject({ codigo: "SESSAO_INVALIDA" });
  });
  it("mudança de idade do alvo confirma revisão mesmo quando a partida é recusada", async () => {
    const r = await abrir();
    const menor = await familiaSocial();
    const [antes] = await db.select().from(profiles).where(eq(profiles.id, menor.perfil.id));
    await db
      .update(minors)
      .set({ birthYear: new Date().getUTCFullYear() - 14 })
      .where(eq(minors.profileId, menor.perfil.id));
    await expect(
      comJogadorSocial(r.sessao, menor.perfil.id, async () => true),
    ).rejects.toMatchObject({ code: "CONTATO" });
    expect(
      (await db.select().from(profiles).where(eq(profiles.id, menor.perfil.id)))[0]?.policyVersion,
    ).toBe((antes?.policyVersion ?? 0) + 1);
  });
  it("pedidos recíprocos de duas partidas ordenam contas antes de perfis e SID", async () => {
    const a = await abrir(),
      b = await abrir();
    const codigoA = await emitirCodigoDeAmigo(a.sessao),
      codigoB = await emitirCodigoDeAmigo(b.sessao);
    const tentativas = await Promise.allSettled([
      pedirAmizade(a.sessao, { codigo: codigoB.codigo, pedidoId: crypto.randomUUID() }),
      pedirAmizade(b.sessao, { codigo: codigoA.codigo, pedidoId: crypto.randomUUID() }),
    ]);
    expect(tentativas.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    for (const tentativa of tentativas)
      if (tentativa.status === "rejected")
        expect(tentativa.reason).toMatchObject({ code: "PEDIDO_PENDENTE" });
  });
});
