import { createHash } from "node:crypto";
import type { Document } from "@gltf-transform/core";
import { PNG } from "pngjs";
import { z } from "zod";
import { hexParaLinear, inteiroParaHex, luminancia } from "../cor/cores";
import { ErroDeArte } from "../erros";
import {
  ATRIBUTO_MASCARA_PINTURA,
  ATRIBUTO_PESO_PINTURA,
  type PinturaDoObjeto,
  PinturaDoObjetoSchema,
} from "../manifesto";

const byte = z.number().int().min(0).max(255);
export const ReceitaDePinturaSchema = z
  .strictObject({
    catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    versaoDoCatalogo: z.number().int().positive(),
    sha256Origem: z.string().regex(/^[0-9a-f]{64}$/),
    rotulo: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[^\p{Cc}]+$/u),
    materiais: z.array(z.string().min(1).max(128)).min(1).max(16),
    pigmentos: z
      .array(z.tuple([byte, byte, byte]))
      .min(1)
      .max(32),
  })
  .superRefine((receita, ctx) => {
    if (
      new Set(receita.materiais).size !== receita.materiais.length ||
      new Set(receita.pigmentos.map((rgb) => rgb.join(","))).size !== receita.pigmentos.length
    )
      ctx.addIssue({ code: "custom", message: "Material ou pigmento repetido" });
  });
export type ReceitaDePintura = z.infer<typeof ReceitaDePinturaSchema>;
export const ReceitasDePinturaSchema = z
  .strictObject({
    formato: z.literal("morada.perfis-pintura"),
    versao: z.literal(1),
    perfis: z.array(ReceitaDePinturaSchema).min(1).max(512),
  })
  .superRefine(({ perfis }, ctx) => {
    if (new Set(perfis.map((p) => `${p.catalogo}@${p.versaoDoCatalogo}`)).size !== perfis.length)
      ctx.addIssue({ code: "custom", message: "Peça repetida nos perfis de pintura" });
  });

const inteiro = ([r, g, b]: readonly [number, number, number]): number => r * 65536 + g * 256 + b;

/**
 * Perfil fechado atlas16_v1: triângulos usam um único texel central opaco.
 * Adiciona atributos; não modifica pixels, UV, posições, materiais transparentes
 * ou índices. A quantização posterior precisa preservar esses pesos float32.
 */
export function prepararPinturaDoMovel(
  doc: Document,
  bruto: unknown,
  sha256Origem: string,
): PinturaDoObjeto {
  const receita = ReceitaDePinturaSchema.parse(bruto);
  function falhar(mensagem: string): never {
    throw new ErroDeArte(receita.catalogo, mensagem);
  }
  if (receita.sha256Origem !== sha256Origem)
    falhar("origem mudou; o perfil exige nova homologação");
  const pigmentos = receita.pigmentos.map((rgb) => ({
    rgb: inteiro(rgb),
    luz: luminancia(hexParaLinear(inteiroParaHex(inteiro(rgb)))),
  }));
  const referencia = [...pigmentos].sort((a, b) => b.luz - a.luz || a.rgb - b.rgb)[0];
  if (!referencia || referencia.luz <= 0) falhar("pintura sem referência luminosa positiva");
  const dadosDoPerfil = {
    formato: "morada.pintura.atlas16",
    versao: 1,
    catalogo: receita.catalogo,
    versaoDoCatalogo: receita.versaoDoCatalogo,
    sha256Origem,
    rotulo: receita.rotulo,
    materiais: [...receita.materiais].sort(),
    pigmentos: pigmentos.map((p) => p.rgb).sort((a, b) => a - b),
  };
  const perfil = createHash("sha256").update(JSON.stringify(dadosDoPerfil)).digest("hex");
  const materiais = doc
    .getRoot()
    .listMaterials()
    .filter((m) => receita.materiais.includes(m.getName()));
  if (
    materiais.length !== receita.materiais.length ||
    new Set(materiais.map((m) => m.getName())).size !== materiais.length
  )
    falhar("material declarado ausente ou ambíguo");
  const encontrados = new Set<number>();
  let pintados = 0;
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  for (const material of materiais) {
    if (material.getAlphaMode() !== "OPAQUE" || material.getBaseColorFactor().some((c) => c !== 1))
      falhar("o perfil aceita somente atlas opaco de fator branco");
    const textura = material.getBaseColorTexture(),
      info = material.getBaseColorTextureInfo();
    const bytes = textura?.getImage();
    if (
      !textura ||
      !info ||
      !bytes ||
      textura.getMimeType() !== "image/png" ||
      info.getTexCoord() !== 0 ||
      info.getExtension("KHR_texture_transform") ||
      info.getMagFilter() !== 9728 ||
      (info.getMinFilter() !== 9728 && info.getMinFilter() !== 9984)
    )
      falhar("atlas/UV/filtro não pertence ao perfil homologado");
    const png = PNG.sync.read(Buffer.from(bytes));
    if (png.width !== 16 || png.height !== 16) falhar("o perfil exige a grade original 16×16");
    for (const mesh of doc.getRoot().listMeshes())
      for (const primitiva of mesh.listPrimitives()) {
        if (primitiva.getMaterial() !== material) continue;
        const uv = primitiva.getAttribute("TEXCOORD_0"),
          pos = primitiva.getAttribute("POSITION");
        if (
          !uv ||
          !pos ||
          uv.getType() !== "VEC2" ||
          pos.getType() !== "VEC3" ||
          uv.getCount() !== pos.getCount() ||
          primitiva.getAttribute("COLOR_0") ||
          primitiva.getMode() !== 4
        )
          falhar("geometria fora do perfil de pintura");
        if (
          primitiva.getAttribute(ATRIBUTO_MASCARA_PINTURA) ||
          primitiva.getAttribute(ATRIBUTO_PESO_PINTURA)
        )
          falhar("o modelo já contém atributos de pintura");
        const mascara = new Float32Array(uv.getCount()),
          pesos = new Float32Array(uv.getCount());
        const texels: number[] = [];
        for (let i = 0; i < uv.getCount(); i++) {
          const coordenada = uv.getElement(i, [0, 0]);
          const u = coordenada[0],
            v = coordenada[1];
          if (
            u === undefined ||
            v === undefined ||
            !Number.isFinite(u) ||
            !Number.isFinite(v) ||
            u < 0 ||
            u >= 1 ||
            v < 0 ||
            v >= 1
          )
            falhar("UV fora da grade original");
          const x = Math.floor(u * 16),
            y = Math.floor(v * 16);
          if (Math.abs(u * 16 - x - 0.5) > 0.000001 || Math.abs(v * 16 - y - 0.5) > 0.000001)
            falhar("UV fora do centro de texel");
          texels.push(y * 16 + x);
          const offset = (y * 16 + x) * 4;
          const r = png.data[offset],
            g = png.data[offset + 1],
            b = png.data[offset + 2],
            a = png.data[offset + 3];
          if (r === undefined || g === undefined || b === undefined || a !== 255)
            falhar("pigmento ausente ou não opaco");
          const cor = inteiro([r, g, b]);
          if (!pigmentos.some((p) => p.rgb === cor)) continue;
          mascara[i] = 1;
          pesos[i] = luminancia(hexParaLinear(inteiroParaHex(cor))) / referencia.luz;
          encontrados.add(cor);
          pintados++;
        }
        const indices = primitiva.getIndices()?.getArray();
        const quantidade = indices?.length ?? texels.length;
        if (quantidade % 3 !== 0) falhar("índices incompletos");
        for (let i = 0; i < quantidade; i += 3) {
          const a = indices?.[i] ?? i,
            b = indices?.[i + 1] ?? i + 1,
            c = indices?.[i + 2] ?? i + 2;
          if (texels[a] === undefined || texels[a] !== texels[b] || texels[b] !== texels[c])
            falhar("triângulo mistura texels");
        }
        primitiva.setAttribute(
          ATRIBUTO_MASCARA_PINTURA,
          doc.createAccessor().setType("SCALAR").setArray(mascara).setBuffer(buffer),
        );
        primitiva.setAttribute(
          ATRIBUTO_PESO_PINTURA,
          doc.createAccessor().setType("SCALAR").setArray(pesos).setBuffer(buffer),
        );
      }
    material.setExtras({ ...material.getExtras(), moradaPintura: { perfil } });
  }
  if (!pintados || pigmentos.some((p) => !encontrados.has(p.rgb)))
    falhar("pigmento declarado não aparece na superfície");
  return PinturaDoObjetoSchema.parse({
    perfil,
    rotulo: receita.rotulo,
    referencia: referencia.rgb,
    mascara: ATRIBUTO_MASCARA_PINTURA,
    pesos: ATRIBUTO_PESO_PINTURA,
  });
}
