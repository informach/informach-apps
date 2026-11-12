import { readFileSync } from "node:fs";
import { z } from "zod";
import { ErroDeArte, validar } from "../erros";

/**
 * As tabelas que só existem dentro da página de referência
 * (`paginas/tipos_de_corpo/corpos.html`): a lista de corpos, os tons de pele
 * prontos, as cores de cabelo e de manta com nome, a cor de referência da
 * paleta de pele e quais corpos dividem a biblioteca de animação. O elenco usa
 * esses nomes ("Clara", "Loiro"), e a conta da cor depende deles.
 *
 * São lidas da página em tempo de execução, para o código não carregar cópia
 * de nada da arte e para a página continuar sendo a fonte única. O que se lê
 * são declarações `const NOME = { ... };` com valores literais.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const cores = z.record(z.string(), hex);

export const TabelasDaPaginaSchema = z.strictObject({
  CORPOS: z.array(
    z.strictObject({
      id: z.string().min(1),
      rotulo: z.string(),
      sexo: z.enum(["m", "f"]),
      idade: z.string().min(1),
    }),
  ),
  /** Tons de pele prontos. */
  TONS: cores,
  /** Cor média da faixa de pele da paleta: a pele é a textura × (tom ÷ esta cor). */
  REF: hex,
  /** Quanto os traços do rosto escurecem em cada tom pronto. */
  ROSTO: z.record(z.string(), z.number()),
  CABELO_CORES: cores,
  MANTA_CORES: cores,
  /** Cor de cabelo com que cada corpo começa. */
  COR_PADRAO: z.record(z.string(), z.string()),
  /** Corpos que usam a biblioteca de animação de outro (mesmo esqueleto). */
  GEMEO: z.record(z.string(), z.string()),
  /** Corpos com formas de gravidez e biblioteca de grávida. */
  COM_GRAVIDA: z.array(z.string()),
  /** Expressões do rosto: id → nome. */
  EXPR: z.record(z.string(), z.string()),
});

export type TabelasDaPagina = z.infer<typeof TabelasDaPaginaSchema>;

/** O literal que vem depois de `const NOME =`, até fechar a primeira chave, colchete ou aspas. */
function literalDe(fonte: string, nome: string, arquivo: string): string {
  const marca = new RegExp(`\\bconst ${nome} = `).exec(fonte);
  if (!marca) throw new ErroDeArte(arquivo, "não achei a declaração na página", nome);
  let i = marca.index + marca[0].length;
  if (fonte.startsWith("new Set(", i)) i += "new Set(".length;
  const abre = fonte[i];
  if (abre === '"') {
    const fim = fonte.indexOf('"', i + 1);
    if (fim < 0) throw new ErroDeArte(arquivo, "texto sem fim", nome);
    return fonte.slice(i, fim + 1);
  }
  if (abre !== "{" && abre !== "[") {
    throw new ErroDeArte(arquivo, "a declaração não é um literal de objeto, lista ou texto", nome);
  }
  let fundo = 0;
  let emTexto = false;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (emTexto) {
      if (c === "\\") j++;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === "{" || c === "[") fundo++;
    else if (c === "}" || c === "]") {
      fundo--;
      if (fundo === 0) return fonte.slice(i, j + 1);
    }
  }
  throw new ErroDeArte(arquivo, "a declaração não fecha", nome);
}

/** Um literal de JavaScript só com textos, números, listas e objetos → JSON. */
function paraJson(literal: string): string {
  let saida = "";
  let emTexto = false;
  for (let i = 0; i < literal.length; i++) {
    const c = literal[i] ?? "";
    if (emTexto) {
      saida += c;
      if (c === "\\") saida += literal[++i] ?? "";
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') {
      emTexto = true;
      saida += c;
      continue;
    }
    if (c === "/" && literal[i + 1] === "/") {
      while (i < literal.length && literal[i] !== "\n") i++;
      continue;
    }
    const chave = /^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/.exec(literal.slice(i));
    if (chave) {
      saida += `"${chave[0]}"`;
      i += chave[0].length - 1;
      continue;
    }
    saida += c;
  }
  return saida.replace(/,(\s*[}\]])/g, "$1");
}

export function decodificarTabelasDaPagina(fonte: string, arquivo: string): TabelasDaPagina {
  const bruto: Record<string, unknown> = {};
  for (const nome of Object.keys(TabelasDaPaginaSchema.shape)) {
    const literal = literalDe(fonte, nome, arquivo);
    try {
      bruto[nome] = JSON.parse(paraJson(literal)) as unknown;
    } catch {
      throw new ErroDeArte(arquivo, "a declaração tem algo além de valores literais", nome);
    }
  }
  return validar(TabelasDaPaginaSchema, bruto, arquivo);
}

export function lerTabelasDaPagina(caminho: string): TabelasDaPagina {
  let fonte: string;
  try {
    fonte = readFileSync(caminho, "utf8");
  } catch {
    throw new ErroDeArte(caminho, "arquivo não encontrado");
  }
  return decodificarTabelasDaPagina(fonte, caminho);
}
