import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contraste dos dois temas, medido sobre o CSS de verdade.
 *
 * O tema claro trazia o contraste prometido em comentários ("branco 4,75:1") e
 * nada que impedisse alguém de mexer no token e quebrar a promessa. O tema
 * escuro só pode existir com essa medição: os tons sólidos foram escolhidos
 * para texto branco sobre fundo claro, e inverter a paleta sem medir produz
 * exatamente o par ilegível que a proposta do produto proíbe.
 *
 * O CSS continua sendo a única fonte dos valores — este teste lê os blocos de
 * token do `globals.css` em vez de manter uma segunda cópia da paleta.
 */

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** Corpo de cada bloco cujo seletor é exatamente `seletor`. */
function corpos(seletor: string) {
  const encontrados: string[] = [];
  let posicao = 0;
  while (posicao < css.length) {
    const inicio = css.indexOf(seletor, posicao);
    if (inicio < 0) break;
    const abre = css.indexOf("{", inicio);
    posicao = inicio + seletor.length;
    // Só interessa quando o seletor vem colado na chave: `:root {` não pode
    // casar com `:root[data-theme="dark"] {`.
    if (abre < 0 || css.slice(inicio + seletor.length, abre).trim() !== "") continue;
    let profundidade = 0;
    for (let i = abre; i < css.length; i += 1) {
      if (css[i] === "{") profundidade += 1;
      if (css[i] === "}") {
        profundidade -= 1;
        if (profundidade === 0) {
          encontrados.push(css.slice(abre + 1, i));
          posicao = i;
          break;
        }
      }
    }
  }
  return encontrados;
}

function tokensDe(seletor: string) {
  const tokens: Record<string, string> = {};
  for (const corpo of corpos(seletor))
    for (const [, nome, valor] of corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      if (nome && valor) tokens[nome] = valor.trim();
  return tokens;
}

type Rgb = [number, number, number];

/** oklch(L C H) → sRGB linear, seguindo as matrizes da especificação. */
function oklchParaLinear(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const lRaiz = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRaiz = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRaiz = l - 0.0894841775 * a - 1.291485548 * b;
  const lLong = lRaiz ** 3;
  const m = mRaiz ** 3;
  const s = sRaiz ** 3;
  return [
    4.0767416621 * lLong - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * lLong + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * lLong - 0.7034186147 * m + 1.707614701 * s,
  ].map((canal) => Math.min(Math.max(canal, 0), 1)) as Rgb;
}

function hexParaLinear(hex: string): Rgb {
  const limpo = hex.replace("#", "");
  const largo =
    limpo.length === 3
      ? [...limpo].map((digito) => digito + digito).join("")
      : limpo.padEnd(6, "0");
  return [0, 1, 2].map((indice) => {
    const canal = Number.parseInt(largo.slice(indice * 2, indice * 2 + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
}

/** Resolve um valor de token até uma cor linear, seguindo `var(--outro)`. */
function resolver(valor: string, tokens: Record<string, string>, visitados = 0): Rgb {
  if (visitados > 10) throw new Error(`Referência circular em ${valor}`);
  const referencia = /^var\((--[\w-]+)\)$/.exec(valor.trim());
  if (referencia) {
    const alvo = referencia[1];
    const proximo = alvo && tokens[alvo];
    if (!proximo) throw new Error(`Token sem valor: ${alvo}`);
    return resolver(proximo, tokens, visitados + 1);
  }
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(valor.trim());
  if (oklch) {
    const [, l, c, h] = oklch;
    return oklchParaLinear(Number(l), Number(c), Number(h));
  }
  if (valor.trim().startsWith("#")) return hexParaLinear(valor.trim());
  if (valor.trim() === "oklch(1 0 0)") return [1, 1, 1];
  throw new Error(`Formato de cor não suportado: ${valor}`);
}

function luminancia([r, g, b]: Rgb) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(frente: Rgb, fundo: Rgb) {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const claro = Math.max(a, b);
  const escuro = Math.min(a, b);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Mistura `cor` sobre `fundo` com a opacidade dada, em espaço linear. */
function misturar(cor: Rgb, fundo: Rgb, opacidade: number): Rgb {
  return [0, 1, 2].map((i) => (cor[i] ?? 0) * opacidade + (fundo[i] ?? 0) * (1 - opacidade)) as Rgb;
}

/**
 * Pares que o sistema realmente usa. `sobre` é a opacidade aplicada ao fundo
 * — as etiquetas e as chapas pintam o tom com transparência sobre a superfície.
 */
const pares: {
  frente: string;
  fundo: string;
  base?: string;
  opacidade?: number;
  /** 4,5:1 para texto; 3:1 para glifo decorativo, que é componente de interface. */
  minimo?: number;
}[] = [
  { frente: "--ms-tinta", fundo: "--ms-papel" },
  { frente: "--ms-tinta", fundo: "--ms-creme" },
  { frente: "--ms-tinta-suave", fundo: "--ms-papel" },
  { frente: "--ms-tinta-suave", fundo: "--ms-creme" },
  { frente: "--ms-tinta", fundo: "--ms-verde-claro" },
  { frente: "--ms-tinta", fundo: "--ms-uva-claro" },
  { frente: "--ms-tinta", fundo: "--ms-sol-claro" },
  { frente: "--ms-tinta", fundo: "--ms-coral-claro" },
  { frente: "--ms-tinta", fundo: "--ms-ceu-claro" },
  { frente: "--ms-tinta-suave", fundo: "--ms-verde-claro" },
  { frente: "--ms-tinta-suave", fundo: "--ms-uva-claro" },
  { frente: "--ms-tinta-suave", fundo: "--ms-sol-claro" },
  { frente: "--ms-tinta-suave", fundo: "--ms-coral-claro" },
  { frente: "--ms-tinta-suave", fundo: "--ms-ceu-claro" },
  // Etiqueta e chapa de lima: o tom entra com transparência sobre a superfície.
  { frente: "--ms-tinta", fundo: "--ms-lima", base: "--ms-creme", opacidade: 0.4 },
  { frente: "--ms-tinta", fundo: "--ms-lima", base: "--ms-papel", opacidade: 0.35 },
  { frente: "--ms-tinta-suave", fundo: "--ms-lima", base: "--ms-creme", opacidade: 0.4 },
  // Botões e selos de preenchimento sólido.
  { frente: "--ms-sobre-verde", fundo: "--ms-verde-solido" },
  { frente: "--ms-sobre-uva", fundo: "--ms-uva-solido" },
  { frente: "--ms-sobre-coral", fundo: "--ms-coral-solido" },
  { frente: "--ms-sobre-ceu", fundo: "--ms-ceu-solido" },
  { frente: "--ms-sobre-sol", fundo: "--ms-sol-solido" },
  { frente: "--ms-sobre-lima", fundo: "--ms-lima-solido" },
  { frente: "--ms-sobre-creme", fundo: "--ms-creme" },
  // Nó atual da trilha, aba ativa e numeração de capítulo pintam lima cheia.
  { frente: "--ms-tinta", fundo: "--ms-lima" },
  // Os dois avatares que não usam um par `-solido` completam a lista de oito.
  { frente: "--ms-sobre-ceu", fundo: "--ms-ceu-fundo", minimo: 3 },
  { frente: "--ms-sobre-verde", fundo: "--ms-verde-fundo", minimo: 3 },
];

/* Os blocos `:root` do arquivo se somam no navegador, então somam aqui também.
   O tema escuro é o mesmo mapa com o remapeamento real do seletor manual por
   cima — medir a duplicata em vez do CSS de verdade não provaria nada. */
const raiz = tokensDe(":root");
const remapeamentoEscuro = tokensDe(':root[data-theme="dark"]');
const temas = {
  claro: raiz,
  escuro: { ...raiz, ...remapeamentoEscuro },
};

it("mantém os dois seletores de tema escuro com o mesmo remapeamento", () => {
  // O CSS não permite compartilhar um corpo entre um `@media` e um seletor de
  // atributo, então o bloco existe duas vezes. Se um deles receber um token e o
  // outro não, metade dos leitores fica com um tema pela metade.
  const porPreferencia = tokensDe(':root:not([data-theme="light"])');
  expect(porPreferencia).toEqual(remapeamentoEscuro);
  expect(Object.keys(remapeamentoEscuro).length).toBeGreaterThan(20);
});

describe.each(Object.entries(temas))("contraste do tema %s", (_nome, tokens) => {
  it.each(pares)("$frente sobre $fundo passa o mínimo", (par) => {
    const frenteValor = tokens[par.frente];
    const fundoValor = tokens[par.fundo];
    if (!frenteValor || !fundoValor) throw new Error(`Token ausente: ${par.frente} / ${par.fundo}`);
    const frente = resolver(frenteValor, tokens);
    let fundo = resolver(fundoValor, tokens);
    if (par.base && par.opacidade !== undefined) {
      const base = tokens[par.base];
      if (!base) throw new Error(`Token ausente: ${par.base}`);
      fundo = misturar(fundo, resolver(base, tokens), par.opacidade);
    }
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(par.minimo ?? 4.5);
  });
});
