import { randomBytes } from "node:crypto";
import { db, eq } from "@informach/db";
import { recreioGameSessions as games, recreioGameTickets as tickets } from "@informach/db/schema";
import { SessaoDeJogoIdSchema } from "@informach/recreio";
import { SessaoAbertaSchema } from "@informach/recreio/contrato";
import { verificarIngresso } from "@informach/recreio/emissor";
import { criarRecreio } from "@informach/recreio/sdk";
import { describe, expect, it } from "vitest";
import { encerrarSessaoDeAparelho } from "@/features/sessao/service";
import { abrirSessaoComIngresso } from "@/features/sessao-de-jogo/repository";
import {
  emitirIngresso,
  sairDaSessao,
  sessaoDeJogoDoToken,
  trocarIngresso,
} from "@/features/sessao-de-jogo/service";
import { codigoDoPostgres, constraintDoPostgres } from "@/lib/repository";
import { chavesDoRecreio } from "@/lib/tokens";
import { eventosCom, novoJogador } from "./apoio";
import { claimsDe } from "./jogo-apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

async function abertura() {
  const pessoa = await novoJogador();
  const ingresso = await emitirIngresso(pessoa.ator, { jogo: "morada" });
  const chaveDeTroca = randomBytes(32).toString("base64url");
  const pedido = { ingresso: ingresso.ingresso, chaveDeTroca };
  const resposta = await pedir("POST", "/api/sdk/v1/sessao", { corpo: pedido });
  expect(resposta.status).toBe(200);
  const aberta = SessaoAbertaSchema.parse(resposta.corpo);
  const sessao = await sessaoDeJogoDoToken(aberta.token);
  return { pessoa, pedido, aberta, sessao };
}

describe("recibo de abertura com prova do solicitante", () => {
  it("SDK recupera a resposta perdida depois do commit real sem pedir outro ingresso", async () => {
    const pessoa = await novoJogador();
    const ingresso = await emitirIngresso(pessoa.ator, { jogo: "morada" });
    let emissoes = 0;
    let trocas = 0;
    let primeiroSid: string | null = null;
    const contexto = await criarRecreio({
      baseUrl: ORIGEM,
      jogo: "morada",
      recuperarAbertura: true,
      obterIngresso: async () => {
        emissoes++;
        return ingresso.ingresso;
      },
      fetch: async (url, init) => {
        const resposta = await despachar(url, init);
        if (new URL(url).pathname === "/api/sdk/v1/sessao") {
          trocas++;
          if (trocas === 1) {
            expect(resposta.status).toBe(200);
            const aberta = SessaoAbertaSchema.parse(await resposta.clone().json());
            primeiroSid = (await sessaoDeJogoDoToken(aberta.token)).sid;
            throw new Error("Resposta perdida depois de confirmar a abertura");
          }
        }
        return resposta;
      },
    });
    try {
      expect(emissoes).toBe(1);
      expect(trocas).toBe(2);
      expect((await sessaoDeJogoDoToken(contexto.sessao.token())).sid).toBe(primeiroSid);
      expect(
        await db.select().from(games).where(eq(games.profileId, pessoa.perfil.id)),
      ).toHaveLength(1);
      expect(
        (await eventosCom("profileId", pessoa.perfil.id)).filter(
          (e) => e.eventType === "recreio.game_session_started",
        ),
      ).toHaveLength(1);
    } finally {
      await contexto.sessao.sair();
    }
  });
  it("recupera a mesma abertura concorrente sem novo prazo, consumo ou auditoria de início", async () => {
    const r = await abertura();
    const antes = await db.select().from(games).where(eq(games.id, r.sessao.sid));
    const [recibo] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.openedSessionId, r.sessao.sid));
    expect(recibo?.exchangeKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(recibo)).not.toContain(r.pedido.chaveDeTroca);
    const respostas = await Promise.all([trocarIngresso(r.pedido), trocarIngresso(r.pedido)]);
    for (const resposta of respostas) {
      expect((await sessaoDeJogoDoToken(resposta.token)).sid).toBe(r.sessao.sid);
      expect(resposta.expiraEm).toBe(r.aberta.expiraEm);
    }
    expect(await db.select().from(games).where(eq(games.id, r.sessao.sid))).toEqual(antes);
    expect(
      (
        await db
          .select()
          .from(tickets)
          .where(eq(tickets.jti, String(claimsDe(r.pedido.ingresso).jti)))
      )[0],
    ).toEqual(recibo);
    expect(
      (await eventosCom("sessionId", r.sessao.sid)).filter(
        (e) => e.eventType === "recreio.game_session_started",
      ),
    ).toHaveLength(1);
  });

  it("sem prova, com prova errada ou sem recibo anterior não recupera o uso consumido", async () => {
    const r = await abertura();
    for (const chaveDeTroca of [undefined, randomBytes(32).toString("base64url")])
      await expect(
        trocarIngresso({ ingresso: r.pedido.ingresso, chaveDeTroca }),
      ).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
    await db
      .update(tickets)
      .set({ exchangeKeyHash: null })
      .where(eq(tickets.openedSessionId, r.sessao.sid));
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  });

  it("não confunde uma nova partida do mesmo perfil com a abertura que já terminou", async () => {
    const r = await abertura();
    await sairDaSessao(r.aberta.token);
    const novo = await emitirIngresso(r.pessoa.ator, { jogo: "morada" });
    const outra = await trocarIngresso({ ingresso: novo.ingresso });
    expect((await sessaoDeJogoDoToken(outra.token)).sid).not.toBe(r.sessao.sid);
    await expect(trocarIngresso(r.pedido)).rejects.toMatchObject({ codigo: "INGRESSO_INVALIDO" });
  });

  it("a prova não ultrapassa revogação, vencimento ou barreira de checkpoint", async () => {
    const revogada = await abertura();
    await encerrarSessaoDeAparelho({
      authSessionId: revogada.pessoa.login.authSessionId,
      contaId: revogada.pessoa.conta.id,
    });
    await expect(trocarIngresso(revogada.pedido)).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    const pausada = await abertura();
    await db
      .update(games)
      .set({ checkpointFrozenAt: new Date() })
      .where(eq(games.id, pausada.sessao.sid));
    await expect(trocarIngresso(pausada.pedido)).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
    const vencida = await abertura();
    await db
      .update(tickets)
      .set({ issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tickets.openedSessionId, vencida.sessao.sid));
    await expect(trocarIngresso(vencida.pedido)).rejects.toMatchObject({
      codigo: "INGRESSO_INVALIDO",
    });
  });

  it("uma colisão inesperada de chave primária não vira JA_ABERTO nem consome o ingresso", async () => {
    const existente = await abertura();
    const pessoa = await novoJogador();
    const pedido = await emitirIngresso(pessoa.ator, { jogo: "morada" });
    const { emissor, chaves } = await chavesDoRecreio();
    const ingresso = await verificarIngresso(pedido.ingresso, { chaves, emissor: emissor.emissor });
    let erro: unknown;
    try {
      await abrirSessaoComIngresso({
        ingresso,
        emissor,
        sid: SessaoDeJogoIdSchema.parse(existente.sessao.sid),
        continuarAqui: false,
      });
    } catch (falha) {
      erro = falha;
    }
    expect(codigoDoPostgres(erro)).toBe("23505");
    expect(constraintDoPostgres(erro)).not.toBe("recreio_game_sessions_one_open");
    expect(
      (await db.select().from(tickets).where(eq(tickets.jti, ingresso.jti)))[0]?.consumedAt,
    ).toBeNull();
    expect(await db.select().from(games).where(eq(games.profileId, pessoa.perfil.id))).toEqual([]);
    expect(
      (await eventosCom("profileId", pessoa.perfil.id)).filter(
        (e) => e.eventType === "recreio.game_session_started",
      ),
    ).toEqual([]);
    expect(await trocarIngresso({ ingresso: pedido.ingresso })).toMatchObject({
      perfil: { profileId: pessoa.perfil.id },
    });
  });
});
