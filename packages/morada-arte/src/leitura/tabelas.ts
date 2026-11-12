import { readFileSync } from "node:fs";
import { z } from "zod";
import { ErroDeArte, lerJson, validar } from "../erros";
import { abrirGzBase64 } from "./item";

/**
 * As duas tabelas que ligam peças a corpos: `familias.txt` (as malhas-base m, f
 * e p em que cada peça foi encaixada) e `peles.txt` (como cada corpo se liga à
 * malha-base da família dele). JSON em gzip + base64.
 */

const ponto = z.tuple([z.number(), z.number(), z.number()]);
const caixa = z.tuple([ponto, ponto]);
const inteiro = z.number().int().nonnegative();

export const FamiliasSchema = z.record(
  z.string(),
  z.strictObject({
    /** Triângulos da malha-base, na ordem de vértices do Blender. */
    tris: z.array(inteiro),
    /** Área de cada triângulo na malha-base. */
    areas: z.array(z.number()),
    nv: inteiro,
    /** Caixa da cabeça da malha-base, em coordenadas do Blender. */
    cabeca: caixa,
  }),
);

export const PelesSchema = z.record(
  z.string(),
  z.strictObject({
    familia: z.string().min(1),
    /** Vértice do Blender (ordem da malha-base) → vértice do GLB do corpo. */
    b2g: z.array(inteiro),
    /** Mundo do Blender → espaço da malha no GLB: três linhas de quatro números. */
    afim: z.tuple([
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
    ]),
    /** Caixa da cabeça do corpo, em coordenadas do Blender. */
    cabeca: caixa,
  }),
);

export type Familia = {
  nome: string;
  /** Triângulos (três vértices cada), ordem do Blender. */
  tris: Uint32Array;
  areas: Float64Array;
  nv: number;
  cabeca: z.infer<typeof caixa>;
};

export type Pele = z.infer<typeof PelesSchema>[string];

function lerTabela(caminho: string): unknown {
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch {
    throw new ErroDeArte(caminho, "arquivo não encontrado");
  }
  return lerJson(abrirGzBase64(texto, caminho).toString("utf8"), caminho);
}

export function decodificarFamilias(dado: unknown, arquivo: string): Map<string, Familia> {
  const lidas = validar(FamiliasSchema, dado, arquivo);
  const familias = new Map<string, Familia>();
  for (const [nome, f] of Object.entries(lidas)) {
    if (f.tris.length % 3 !== 0 || f.areas.length * 3 !== f.tris.length) {
      throw new ErroDeArte(arquivo, "triângulos e áreas não fecham", `${nome}.areas`);
    }
    for (const v of f.tris) {
      if (v >= f.nv)
        throw new ErroDeArte(arquivo, `vértice ${v} fora da malha-base`, `${nome}.tris`);
    }
    familias.set(nome, {
      nome,
      tris: Uint32Array.from(f.tris),
      areas: Float64Array.from(f.areas),
      nv: f.nv,
      cabeca: f.cabeca,
    });
  }
  return familias;
}

export function lerFamilias(caminho: string): Map<string, Familia> {
  return decodificarFamilias(lerTabela(caminho), caminho);
}

export function decodificarPeles(dado: unknown, arquivo: string): Map<string, Pele> {
  return new Map(Object.entries(validar(PelesSchema, dado, arquivo)));
}

export function lerPeles(caminho: string): Map<string, Pele> {
  return decodificarPeles(lerTabela(caminho), caminho);
}
