import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { MARCA_DO_CLIENTE } from "../src/index";

/**
 * O peso do jogo e a promessa de que ele não vaza para quem não joga. Os
 * números vêm da bancada construída (`bancada/dist`), que o Playwright
 * constrói antes de começar.
 */

/** Teto do JavaScript que a página do jogo carrega, somando tudo, sem comprimir. */
const TETO_DO_JOGO_BYTES = 1_250_000;
/** O mesmo, com gzip: é o que atravessa a rede. */
const TETO_DO_JOGO_GZIP_BYTES = 360_000;
/** A página que só importa a marca carrega quase nada. */
const TETO_DA_MARCA_BYTES = 8_000;
/** Um nome que só existe dentro do three.js. */
const SINAL_DO_THREE = "WebGLRenderer";

type Entrada = { file: string; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean };

const dist = fileURLToPath(new URL("../bancada/dist/", import.meta.url));

function manifesto(): Record<string, Entrada> {
  return JSON.parse(readFileSync(`${dist}.vite/manifest.json`, "utf8")) as Record<string, Entrada>;
}

/** Os arquivos que uma página carrega: só os imports estáticos, ou também os sob demanda. */
function arquivosDe(inicio: string, comSobDemanda: boolean): string[] {
  const entradas = manifesto();
  const vistos = new Set<string>();
  const fila = [inicio];
  while (fila.length > 0) {
    const chave = fila.pop();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    const entrada = entradas[chave];
    if (!entrada) throw new Error(`O manifesto não tem ${chave}`);
    fila.push(...(entrada.imports ?? []));
    if (comSobDemanda) fila.push(...(entrada.dynamicImports ?? []));
  }
  return [...vistos]
    .map((chave) => entradas[chave]?.file ?? "")
    .filter((arquivo) => arquivo.endsWith(".js"));
}

function ler(arquivo: string): Buffer {
  return readFileSync(`${dist}${arquivo}`);
}

test("o JavaScript do jogo cabe no orçamento", () => {
  const arquivos = arquivosDe("index.html", true);
  const bytes = arquivos.reduce((soma, arquivo) => soma + ler(arquivo).length, 0);
  const comprimido = arquivos.reduce((soma, arquivo) => soma + gzipSync(ler(arquivo)).length, 0);
  test.info().annotations.push({
    type: "tamanho",
    description: `${arquivos.length} arquivos, ${bytes} bytes, ${comprimido} com gzip`,
  });
  console.log(`JS do jogo: ${arquivos.length} arquivos, ${bytes} bytes, ${comprimido} com gzip`);
  // O three.js está lá dentro: é o jogo.
  expect(arquivos.some((arquivo) => ler(arquivo).includes(SINAL_DO_THREE))).toBe(true);
  expect(bytes).toBeLessThanOrEqual(TETO_DO_JOGO_BYTES);
  expect(comprimido).toBeLessThanOrEqual(TETO_DO_JOGO_GZIP_BYTES);
});

test("quem importa só a marca não carrega o three.js nem o HUD", () => {
  const estaticos = arquivosDe("marca.html", false);
  expect(estaticos.length).toBeGreaterThan(0);
  const bytes = estaticos.reduce((soma, arquivo) => soma + ler(arquivo).length, 0);
  console.log(`JS da página da marca: ${estaticos.join(", ")} (${bytes} bytes)`);
  expect(bytes).toBeLessThanOrEqual(TETO_DA_MARCA_BYTES);
  for (const arquivo of estaticos) {
    const texto = ler(arquivo).toString("utf8");
    expect(texto).not.toContain(SINAL_DO_THREE);
    expect(texto).not.toContain("morada-hud");
  }
  expect(estaticos.some((arquivo) => ler(arquivo).includes(MARCA_DO_CLIENTE))).toBe(true);
  // O jogo continua alcançável, mas só sob demanda.
  const sobDemanda = arquivosDe("marca.html", true).filter((a) => !estaticos.includes(a));
  expect(sobDemanda.some((arquivo) => ler(arquivo).includes(SINAL_DO_THREE))).toBe(true);
});

test("no navegador, a página da marca mostra a marca e não baixa o jogo", async ({ page }) => {
  const baixados: string[] = [];
  page.on("response", (resposta) => {
    if (resposta.url().endsWith(".js")) baixados.push(resposta.url());
  });
  await page.goto("/marca.html");
  await expect(page.locator("#marca")).toHaveText(MARCA_DO_CLIENTE);
  await page.waitForLoadState("networkidle");
  expect(baixados.length).toBeGreaterThan(0);
  for (const url of baixados) {
    const corpo = await (await page.request.get(url)).text();
    expect(corpo).not.toContain(SINAL_DO_THREE);
  }
  // Nenhum canvas, nenhum HUD: o jogo não foi montado.
  await expect(page.locator("canvas")).toHaveCount(0);
});
