import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { LoteId, MoradorId } from "@informach/morada-sim";
import { expect, type Page } from "@playwright/test";

/**
 * Apoio dos testes de navegador. Tudo o que olha para dentro do jogo passa por
 * `window.__morada`, que a bancada liga com `depurar`: o espelho do mundo e o
 * que a cena desenhou. Os testes clicam na tela de verdade; o apoio só diz
 * onde clicar.
 */

const telas = fileURLToPath(new URL("./telas/", import.meta.url));

/** Guarda uma foto da tela como evidência local. A pasta é ignorada pelo git. */
export async function fotografar(pagina: Page, nome: string): Promise<void> {
  mkdirSync(telas, { recursive: true });
  await pagina.screenshot({ path: `${telas}${nome}.png` });
}

/**
 * Entra na bancada com um apelido e espera o mundo aparecer. `validadeS` faz a
 * sessão de jogo valer só esses segundos, para os testes de renovação.
 */
export async function entrar(pagina: Page, apelido: string, validadeS?: number): Promise<void> {
  const validade = validadeS === undefined ? "" : `&validade=${validadeS}`;
  await pagina.goto(`/?apelido=${encodeURIComponent(apelido)}${validade}`);
  await pagina.waitForFunction(() => window.__morada?.conexao() === "pronto");
  await expect(pagina.locator("canvas.morada-tela")).toBeVisible();
  // A cena desenhou os moradores pelo menos uma vez.
  await pagina.waitForFunction(() => Object.keys(window.__morada?.posicoes() ?? {}).length > 0);
}

export async function idDoMorador(pagina: Page, nome: string): Promise<MoradorId> {
  const id = await pagina.evaluate((procurado) => {
    const visao = window.__morada?.espelho();
    return visao?.moradores.ordem.find((m) => visao.moradores.porId[m]?.nome === procurado);
  }, nome);
  if (!id) throw new Error(`Não há morador chamado ${nome}`);
  return id;
}

/** O retrato de um morador no HUD. */
export function retrato(pagina: Page, nome: string) {
  return pagina.locator(".morada-retrato").filter({
    has: pagina.locator(".morada-retrato-nome", { hasText: new RegExp(`^${nome}$`) }),
  });
}

export type PontoDeClique = { x: number; y: number; pos: [number, number]; loteId: LoteId };

/**
 * Um lugar livre do chão, visível e sem nada por cima, a alguma distância de
 * onde o morador está. Quem escolhe é a própria cena: o teste pergunta o que
 * um clique em cada ponto acertaria e fica com o primeiro que serve.
 */
export async function chaoLivre(
  pagina: Page,
  moradorId: MoradorId,
  distanciaMinima = 1500,
): Promise<PontoDeClique> {
  const ponto = await pagina.evaluate(
    ({ id, minimo }) => {
      const jogo = window.__morada;
      const desenhado = jogo?.posicoes()[id];
      if (!jogo || !desenhado) return null;
      const visao = jogo.espelho();
      const lote = visao?.lotes.porId[desenhado.loteId];
      if (!lote) return null;
      const candidatos: { x: number; y: number; pos: [number, number]; longe: number }[] = [];
      for (let cx = 125; cx < lote.tamanho[0]; cx += 500) {
        for (let cy = 125; cy < lote.tamanho[1]; cy += 500) {
          const pos: [number, number] = [cx, cy];
          const longe = Math.hypot(cx - desenhado.pos[0], cy - desenhado.pos[1]);
          if (longe < minimo || longe > 6000) continue;
          const tela = jogo.telaDoPonto(desenhado.loteId, pos);
          if (!tela) continue;
          // Nada do HUD por cima: o clique precisa cair na cena.
          const emCima = document.elementFromPoint(tela.x, tela.y);
          if (!(emCima instanceof HTMLCanvasElement)) continue;
          const alvo = jogo.oQueHa(tela.x, tela.y);
          if (alvo?.t !== "chao" || !alvo.livre) continue;
          if (alvo.pos[0] !== cx || alvo.pos[1] !== cy) continue;
          candidatos.push({ x: tela.x, y: tela.y, pos, longe });
        }
      }
      candidatos.sort((a, b) => a.longe - b.longe);
      const escolhido = candidatos[0];
      return escolhido
        ? { x: escolhido.x, y: escolhido.y, pos: escolhido.pos, loteId: desenhado.loteId }
        : null;
    },
    { id: moradorId, minimo: distanciaMinima },
  );
  if (!ponto) throw new Error("Não achei chão livre e visível para clicar");
  return ponto;
}

/** Espera o morador ser desenhado a menos de `folga` milímetros do ponto. */
export async function esperarChegada(
  pagina: Page,
  moradorId: MoradorId,
  pos: [number, number],
  folga = 200,
): Promise<void> {
  await pagina.waitForFunction(
    ({ id, alvo, margem }) => {
      const desenhado = window.__morada?.posicoes()[id];
      return (
        desenhado !== undefined &&
        Math.hypot(desenhado.pos[0] - alvo[0], desenhado.pos[1] - alvo[1]) <= margem
      );
    },
    { id: moradorId, alvo: pos, margem: folga },
    // Uma conversa em curso dura até 40 s de relógio antes de a caminhada começar.
    { timeout: 90_000, polling: 100 },
  );
}

/** A distância, em milímetros, entre onde o morador foi desenhado e um ponto. */
export async function distanciaAte(
  pagina: Page,
  moradorId: MoradorId,
  pos: [number, number],
): Promise<number> {
  return pagina.evaluate(
    ({ id, alvo }) => {
      const desenhado = window.__morada?.posicoes()[id];
      return desenhado
        ? Math.hypot(desenhado.pos[0] - alvo[0], desenhado.pos[1] - alvo[1])
        : Number.POSITIVE_INFINITY;
    },
    { id: moradorId, alvo: pos },
  );
}
