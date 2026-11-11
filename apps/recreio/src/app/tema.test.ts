import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contraste da paleta, medido sobre o CSS de verdade. O tema é escuro, e o
 * texto continua precisando de 4,5:1; borda de campo e de botão, de 3:1.
 * O teste lê os tokens do `globals.css`, sem uma segunda cópia da paleta.
 */
const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tokens = Object.fromEntries(
  [...raiz.matchAll(/(--rc-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, nome, valor]) => [
    nome,
    valor,
  ]),
);

function luminancia(hex: string) {
  const canais = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
function contraste(a: string, b: string) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((escuro ?? 0) + 0.05);
}
const t = (nome: string) => {
  const valor = tokens[`--rc-${nome}`];
  if (!valor) throw new Error(`token --rc-${nome} não encontrado`);
  return valor;
};

describe("contraste da paleta", () => {
  it.each([
    ["tinta", "fundo"],
    ["tinta", "painel"],
    ["tinta", "painel-2"],
    ["tinta-suave", "fundo"],
    ["tinta-suave", "painel"],
    ["tinta-suave", "painel-2"],
    ["sol-texto", "sol"],
    ["sol", "fundo"],
    ["sol", "painel"],
    ["coral", "fundo"],
    ["coral", "painel"],
    ["mar", "fundo"],
    ["mar", "painel"],
    ["ceu", "fundo"],
    ["ceu", "painel"],
    ["fundo", "tinta"],
  ])("texto %s sobre %s tem pelo menos 4,5:1", (texto, fundo) => {
    expect(contraste(t(texto), t(fundo))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["linha-forte", "fundo"],
    ["linha-forte", "painel"],
    ["ceu", "fundo"],
    ["ceu", "painel"],
  ])("borda ou foco %s sobre %s tem pelo menos 3:1", (borda, fundo) => {
    expect(contraste(t(borda), t(fundo))).toBeGreaterThanOrEqual(3);
  });
});
