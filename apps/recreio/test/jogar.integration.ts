import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { temCliente } from "@/features/jogar/registro";
import { prepararPaginaDoJogo } from "@/features/jogar/service";
import { jogoAbre, jogosDoCatalogo, manifestoDoJogo } from "@/features/jogos/config";
import { criarMundo } from "@/features/mundos/service";
import { emitirIngresso } from "@/features/sessao-de-jogo/service";
import { novoJogador } from "./apoio";
import { cabecalhosDoHost, MORADA, mundoDe } from "./jogo-apoio";
import { pedir } from "./rotas";

/**
 * O jogo de teste com a variável desligada, que é como este ambiente roda (e
 * como roda a produção): para o portal inteiro ele é um jogo que não existe.
 * Nada aqui é trocado por dublê; o caminho ligado é coberto pelo E2E e por
 * `jogar-pagina.integration.ts`.
 */
const TESTE = "teste";

describe("jogo de teste desligado", () => {
  it("não está no catálogo deste deploy nem tem cliente no portal", () => {
    expect(process.env.RECREIO_JOGO_DE_TESTE).toBe("0");
    expect(manifestoDoJogo(TESTE)).toBeNull();
    expect(jogoAbre(TESTE)).toBe(false);
    expect(jogosDoCatalogo().map((jogo) => jogo.id)).toEqual([MORADA]);
    expect(temCliente(TESTE)).toBe(false);
  });

  it("a página do jogo responde como a um jogo que não existe, com ou sem mundo", async () => {
    const lia = await novoJogador();
    const mundo = await mundoDe(lia);
    for (const jogo of [TESTE, "nao-existe"]) {
      expect(await prepararPaginaDoJogo(lia.perfil.id, jogo, mundo)).toEqual({
        tipo: "inexistente",
      });
      expect(await prepararPaginaDoJogo(lia.perfil.id, jogo, undefined)).toEqual({
        tipo: "inexistente",
      });
    }
  });

  it("o Morada, que tem cliente no portal, tem página; o jogo de teste continua sem", async () => {
    expect(temCliente(MORADA)).toBe(true);
    const lia = await novoJogador();
    const mundo = await mundoDe(lia, MORADA, "Casa da Lia");
    expect(await prepararPaginaDoJogo(lia.perfil.id, MORADA, mundo)).toEqual({
      tipo: "pronto",
      jogo: { id: MORADA, nome: "Morada", origemDaArte: null },
      mundo: { id: mundo, nome: "Casa da Lia" },
    });
    // O mundo é do Morada: pedido pelo jogo de teste, que não existe aqui, não abre nada.
    expect(await prepararPaginaDoJogo(lia.perfil.id, TESTE, mundo)).toEqual({
      tipo: "inexistente",
    });
  });

  it("não há ingresso, mundo nem instância para ele", async () => {
    const lia = await novoJogador();
    await expect(emitirIngresso(lia.ator, { jogo: TESTE })).rejects.toMatchObject({
      codigo: "JOGO_INDISPONIVEL",
    });
    await expect(
      criarMundo({ perfilId: lia.perfil.id, jogo: TESTE }, { nome: "Mundo de teste" }),
    ).rejects.toMatchObject({ codigo: "JOGO_INDISPONIVEL" });
    // Sem segredo configurado, nenhuma instância dele se registra, nem com o segredo de outro jogo.
    const registro = await pedir("POST", "/api/interno/v1/instancias", {
      headers: cabecalhosDoHost(TESTE, undefined, randomUUID().repeat(2)),
      corpo: { jogo: TESTE, urlPublica: "ws://localhost:3019", versao: "teste", capacidade: 1 },
    });
    expect(registro.status).toBe(401);
  });
});
