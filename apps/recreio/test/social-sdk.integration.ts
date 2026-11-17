import { db, eq, sql } from "@informach/db";
import {
  recreioFriendCodes as codes,
  recreioFriendships as friends,
  recreioGameSessions as games,
  recreioSafetyReports as reports,
} from "@informach/db/schema";
import { criarRecreio } from "@informach/recreio/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import { env } from "@/lib/env";
import { novoJogador } from "./apoio";
import { despachar, ORIGEM, pedir } from "./rotas";

afterEach(() => {
  env.RECREIO_SOCIAL_MODE = "on";
});

async function abrir(social = true, buscar = despachar) {
  const jogador = await novoJogador();
  const sdk = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: "morada",
    social,
    obterIngresso: async () => (await emitirIngresso(jogador.ator, { jogo: "morada" })).ingresso,
    fetch: buscar,
    agendar: () => () => {},
  });
  return { jogador, sdk };
}
async function comSocial() {
  const r = await abrir();
  if (!r.sdk.social) throw new Error("Social não negociado");
  return { ...r, social: r.sdk.social };
}

describe("SDK social negocia capacidade e conserva autenticação e proteção", () => {
  it("denúncia perdida recebe um só protocolo, recuperável com modo fechado e sem repetir automaticamente", async () => {
    let falhar = true,
      tentativas = 0;
    const a = await abrir(true, async (url, init) => {
      const resposta = await despachar(url, init);
      if (typeof init?.body === "string") {
        const corpo: unknown = JSON.parse(init.body);
        if (
          corpo &&
          typeof corpo === "object" &&
          "operacao" in corpo &&
          corpo.operacao === "denunciar"
        ) {
          tentativas++;
          if (falhar) {
            falhar = false;
            throw new Error("resposta perdida depois do commit");
          }
        }
      }
      return resposta;
    });
    const social = a.sdk.social;
    if (!social) throw new Error("Social ausente");
    const b = await comSocial(),
      codigo = await b.social.codigo();
    await social.pedir(codigo.codigo, crypto.randomUUID());
    const entrada = {
      perfilId: b.jogador.perfil.id,
      denunciaId: crypto.randomUUID(),
      categoria: "ameaca" as const,
    };
    await expect(social.denunciar(entrada)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(tentativas).toBe(1);
    const linhas = await db
      .select()
      .from(reports)
      .where(eq(reports.reporterProfileId, a.jogador.perfil.id));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.priority).toBe(true);
    env.RECREIO_SOCIAL_MODE = "off";
    expect(await social.denunciar(entrada)).toEqual({ protocolo: linhas[0]?.id, repetida: true });
    expect(tentativas).toBe(2);
    expect(
      await pedir("POST", "/api/sdk/v1/social", {
        token: a.sdk.sessao.token(),
        corpo: {
          operacao: "denunciar",
          ...entrada,
          actorUserId: b.jogador.conta.id,
        },
      }),
    ).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
    await a.sdk.sessao.sair();
    const antes = tentativas;
    await expect(social.denunciar(entrada)).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    expect(tentativas).toBe(antes);
  });
  it("duas contas em partidas reais concluem pedido, aceite e bloqueio", async () => {
    const a = await comSocial(),
      b = await comSocial();
    const codigo = await b.social.codigo();
    const chave = crypto.randomUUID();
    const pedido = await a.social.pedir(codigo.codigo, chave);
    expect(await a.social.pedir(codigo.codigo, chave)).toEqual({ ...pedido, repetido: true });
    expect(await b.social.aceitar(pedido.pedidoId)).toMatchObject({ estado: "accepted" });
    expect((await a.social.listar()).contatos).toMatchObject([
      { perfilId: b.jogador.perfil.id, amizade: true, online: true },
    ]);
    await b.social.presenca("invisible");
    expect((await a.social.listar()).contatos[0]?.online).toBe(false);
    await a.social.proteger({ perfilId: b.jogador.perfil.id, bloqueado: true, silenciado: true });
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)))[0],
    ).toMatchObject({ state: "removed" });
    const outro = await b.social.codigo();
    await expect(a.social.pedir(outro.codigo, crypto.randomUUID())).rejects.toMatchObject({
      codigo: "NAO_ENCONTRADO",
    });
  });
  it("capacidade exige opt-in; reabrir com novos contatos desligados conserva proteção dos conhecidos", async () => {
    expect((await abrir(false)).sdk.social).toBeUndefined();
    const a = await comSocial(),
      b = await comSocial();
    const codigo = await b.social.codigo();
    const pedido = await a.social.pedir(codigo.codigo, crypto.randomUUID());
    await b.social.aceitar(pedido.pedidoId);
    env.RECREIO_SOCIAL_MODE = "off";
    await a.sdk.sessao.sair();
    const retomada = await criarRecreio({
      baseUrl: ORIGEM,
      jogo: "morada",
      social: true,
      obterIngresso: async () =>
        (await emitirIngresso(a.jogador.ator, { jogo: "morada" })).ingresso,
      fetch: despachar,
      agendar: () => () => {},
    });
    if (!retomada.social) throw new Error("A proteção não foi negociada na retomada");
    expect(await retomada.social.listar()).toMatchObject({
      podeCriarContatos: false,
      contatos: [{ perfilId: b.jogador.perfil.id, amizade: true }],
    });
    await expect(retomada.social.codigo()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await retomada.social.proteger({
      perfilId: b.jogador.perfil.id,
      bloqueado: true,
      silenciado: false,
    });
    await retomada.social.remover(b.jogador.perfil.id);
    expect(
      (await db.select().from(friends).where(eq(friends.requestId, pedido.pedidoId)))[0]?.state,
    ).toBe("removed");
  });
  it("rota recusa token ausente, campos de autoridade inventados e corpo excessivo", async () => {
    const a = await comSocial(),
      b = await comSocial();
    expect(
      (await pedir("POST", "/api/sdk/v1/social", { corpo: { operacao: "codigo" } })).corpo,
    ).toMatchObject({ codigo: "SESSAO_INVALIDA" });
    const resposta = await pedir("POST", "/api/sdk/v1/social", {
      token: a.sdk.sessao.token(),
      corpo: {
        operacao: "proteger",
        perfilId: b.jogador.perfil.id,
        bloqueado: true,
        silenciado: false,
        contaId: b.jogador.conta.id,
      },
    });
    expect(resposta).toMatchObject({ status: 400, corpo: { codigo: "ENTRADA_INVALIDA" } });
    expect(
      await pedir("POST", "/api/sdk/v1/social", {
        token: a.sdk.sessao.token(),
        corpo: { operacao: "codigo", extra: "x".repeat(2049) },
      }),
    ).toMatchObject({ status: 413 });
  });
  it("resposta perdida da emissão não gera outro código automaticamente", async () => {
    let tentativas = 0;
    const r = await abrir(true, async (url, init) => {
      const resposta = await despachar(url, init);
      if (String(url).endsWith("/social")) {
        tentativas++;
        throw new Error("resposta perdida");
      }
      return resposta;
    });
    if (!r.sdk.social) throw new Error("Social ausente");
    await expect(r.sdk.social.codigo()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(tentativas).toBe(1);
    expect(
      await db.select().from(codes).where(eq(codes.profileId, r.jogador.perfil.id)),
    ).toHaveLength(1);
  });
  it("token de SID encerrado não escreve", async () => {
    const r = await comSocial();
    await db.transaction((tx) =>
      encerrarSessoesAbertas(tx, sql`${games.profileId}=${r.jogador.perfil.id}`, "left", {
        porQuem: "conta",
      }),
    );
    await expect(r.social.codigo()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    expect(
      await db.select().from(codes).where(eq(codes.profileId, r.jogador.perfil.id)),
    ).toHaveLength(0);
  });
  it("sair pelo SDK invalida o handle social sem outro pedido de rede", async () => {
    let chamadas = 0;
    const r = await abrir(true, async (url, init) => {
      chamadas++;
      return despachar(url, init);
    });
    if (!r.sdk.social) throw new Error("Social ausente");
    await r.sdk.sessao.sair();
    const antes = chamadas;
    await expect(r.sdk.social.codigo()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    expect(chamadas).toBe(antes);
  });
});
