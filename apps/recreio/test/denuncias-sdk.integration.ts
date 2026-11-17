import { db, eq, sql } from "@informach/db";
import {
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
async function abrir(buscar = despachar) {
  const jogador = await novoJogador();
  const sdk = await criarRecreio({
    baseUrl: ORIGEM,
    jogo: "morada",
    social: true,
    obterIngresso: async () => (await emitirIngresso(jogador.ator, { jogo: "morada" })).ingresso,
    fetch: buscar,
    agendar: () => () => {},
  });
  if (!sdk.social) throw new Error("Social não negociado");
  return { jogador, sdk, social: sdk.social };
}
async function denunciar(
  a: Awaited<ReturnType<typeof abrir>>,
  b: Awaited<ReturnType<typeof abrir>>,
) {
  const codigo = await b.social.codigo();
  await a.social.pedir(codigo.codigo, crypto.randomUUID());
  return a.social.denunciar({
    perfilId: b.jogador.perfil.id,
    denunciaId: crypto.randomUUID(),
    categoria: "outro",
  });
}
describe("protocolos portáteis pelo SID atual, sem autoridade nativa emprestada", () => {
  it("resposta de revisão perdida é recuperada pela leitura e pelo mesmo nonce sem retry automático", async () => {
    let perder = true,
      tentativas = 0;
    const a = await abrir(async (url, init) => {
      const resposta = await despachar(url, init);
      if (String(url).endsWith("/denuncias") && init?.method === "POST") {
        tentativas++;
        if (perder) {
          perder = false;
          throw new Error("resposta perdida após confirmação");
        }
      }
      return resposta;
    });
    const b = await abrir(),
      relato = await denunciar(a, b);
    const propria = await a.social.denuncias(relato.protocolo);
    expect(propria.denuncias).toMatchObject([
      { protocolo: relato.protocolo, situacao: "aberta", podePedirRevisao: false },
    ]);
    for (const reservado of [
      b.jogador.perfil.id,
      b.jogador.conta.id,
      b.jogador.conta.email,
      "targetProfileId",
      "actorUserId",
      "requestHash",
    ])
      expect(JSON.stringify(propria)).not.toContain(reservado);
    expect((await b.social.denuncias(relato.protocolo)).denuncias).toEqual([]);
    await db
      .update(reports)
      .set({ state: "resolvida", revision: 2, decision: "sem_elementos", updatedAt: new Date() })
      .where(eq(reports.id, relato.protocolo));
    const entrada = {
      protocolo: relato.protocolo,
      versaoDoCaso: 2,
      recursoId: crypto.randomUUID(),
    };
    await expect(a.social.reverDenuncia(entrada)).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(tentativas).toBe(1);
    env.RECREIO_SOCIAL_MODE = "off";
    expect((await a.social.denuncias(relato.protocolo)).denuncias).toMatchObject([
      { situacao: "recurso", revisao: 3 },
    ]);
    expect(await a.social.reverDenuncia(entrada)).toEqual({
      protocolo: relato.protocolo,
      repetido: true,
    });
    expect(tentativas).toBe(2);
    expect(
      await pedir("POST", "/api/sdk/v1/denuncias", {
        token: a.sdk.sessao.token(),
        corpo: {
          ...entrada,
          protocolo: entrada.protocolo.toUpperCase(),
          recursoId: entrada.recursoId.toUpperCase(),
        },
      }),
    ).toMatchObject({ status: 200, corpo: { protocolo: relato.protocolo, repetido: true } });
    expect(
      (await db.select().from(reports).where(eq(reports.id, relato.protocolo)))[0]?.revision,
    ).toBe(3);
  });
  it("rota recusa seleção de outro perfil no corpo/consulta, protocolo alheio e corpo excessivo", async () => {
    const a = await abrir(),
      b = await abrir(),
      relato = await denunciar(a, b);
    const path = `/api/sdk/v1/denuncias?protocolo=${relato.protocolo}&perfilId=${a.jogador.perfil.id}`;
    expect(await pedir("GET", path, { token: a.sdk.sessao.token() })).toMatchObject({
      status: 400,
    });
    const entrada = {
      protocolo: relato.protocolo,
      versaoDoCaso: 1,
      recursoId: crypto.randomUUID(),
    };
    expect(
      await pedir("POST", "/api/sdk/v1/denuncias", { token: b.sdk.sessao.token(), corpo: entrada }),
    ).toMatchObject({ status: 404, corpo: { codigo: "NAO_ENCONTRADO" } });
    expect(
      await pedir("POST", "/api/sdk/v1/denuncias", {
        token: a.sdk.sessao.token(),
        corpo: { ...entrada, actorUserId: b.jogador.conta.id },
      }),
    ).toMatchObject({ status: 400 });
    expect(
      await pedir("POST", "/api/sdk/v1/denuncias", {
        token: a.sdk.sessao.token(),
        corpo: { ...entrada, extra: "x".repeat(3000) },
      }),
    ).toMatchObject({ status: 413 });
    expect((await pedir("GET", "/api/sdk/v1/denuncias")).corpo).toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
  });
  it("SID encerrado recusa a leitura; sair invalida os métodos também antes da rede", async () => {
    let chamadas = 0;
    const a = await abrir(async (url, init) => {
      chamadas++;
      return despachar(url, init);
    });
    await db.transaction((tx) =>
      encerrarSessoesAbertas(tx, sql`${games.profileId}=${a.jogador.perfil.id}`, "left", {
        porQuem: "conta",
      }),
    );
    await expect(a.social.denuncias()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    await a.sdk.sessao.sair();
    const antes = chamadas;
    await expect(a.social.denuncias()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    expect(chamadas).toBe(antes);
  });
});
