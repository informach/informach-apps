import { z } from "zod";
import { corpoDaFase } from "../dominio/aparencia";
import { FASES, type Fase } from "../dominio/tipos";

const ref = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const rgb = z.number().int().min(0).max(0xffffff);
const rotulo = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\p{Cc}]*$/u);

/** Escolhas visuais fictícias; não são idade ou identidade da conta do jogador. */
export const EdicaoDaAparenciaSchema = z.strictObject({
  versao: z.literal(1),
  corDoCabelo: rgb,
  coresDaRoupa: z
    .record(ref, rgb)
    .refine((cores) => Object.keys(cores).length <= 16, "Limite de partes da roupa excedido"),
});
export type EdicaoDaAparencia = z.infer<typeof EdicaoDaAparenciaSchema>;

export const OpcaoDeAparenciaSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  fase: z.enum(FASES),
  linha: z.enum(["f", "m"]),
  corpo: ref,
  cabelo: ref,
  roupa: ref,
  rotuloDoCabelo: rotulo,
  rotuloDaRoupa: rotulo,
  peleInicial: rgb,
  edicaoInicial: EdicaoDaAparenciaSchema,
});
export type OpcaoDeAparencia = z.infer<typeof OpcaoDeAparenciaSchema>;

/** Conteúdo validado pelo host e conservado no mundo, nunca fornecido pelo navegador. */
export const CatalogoDeAparenciasSchema = z
  .strictObject({
    formato: z.literal("morada.aparencias"),
    versao: z.literal(1),
    opcoes: z.array(OpcaoDeAparenciaSchema).min(1).max(256),
  })
  .superRefine(({ opcoes }, ctx) => {
    const ids = new Set<string>();
    const combinacoes = new Set<string>();
    for (const opcao of opcoes) {
      const chave = [opcao.fase, opcao.linha, opcao.cabelo, opcao.roupa].join(":");
      if (ids.has(opcao.id) || combinacoes.has(chave))
        ctx.addIssue({ code: "custom", message: "Aparência repetida no catálogo" });
      if (opcao.corpo !== corpoDaFase(opcao.linha, opcao.fase))
        ctx.addIssue({ code: "custom", message: "Corpo incompatível com fase e linha" });
      if (Object.keys(opcao.edicaoInicial.coresDaRoupa).length > 16)
        ctx.addIssue({ code: "custom", message: "Limite de partes da roupa excedido" });
      ids.add(opcao.id);
      combinacoes.add(chave);
    }
  });
export type CatalogoDeAparencias = z.infer<typeof CatalogoDeAparenciasSchema>;

export function opcaoDeAparencia(
  catalogo: CatalogoDeAparencias,
  descricao: {
    fase: Fase;
    linha: "f" | "m";
    cabelo: string;
    roupa: string;
    edicao: EdicaoDaAparencia;
  },
): OpcaoDeAparencia | null {
  const opcao = catalogo.opcoes.find(
    (o) =>
      o.fase === descricao.fase &&
      o.linha === descricao.linha &&
      o.cabelo === descricao.cabelo &&
      o.roupa === descricao.roupa,
  );
  if (!opcao) return null;
  const esperadas = Object.keys(opcao.edicaoInicial.coresDaRoupa).sort();
  const recebidas = Object.keys(descricao.edicao.coresDaRoupa).sort();
  if (esperadas.length !== recebidas.length || esperadas.some((parte, i) => parte !== recebidas[i]))
    return null;
  return opcao;
}

/** Uma combinação oferecida conserva cabelo/conjunto ao crescer, em ambas as linhas. */
export function conferirContinuidadeDaAparencia(catalogo: CatalogoDeAparencias): void {
  const combinacoes = new Map<string, OpcaoDeAparencia>();
  for (const opcao of catalogo.opcoes) combinacoes.set(`${opcao.cabelo}:${opcao.roupa}`, opcao);
  for (const referencia of combinacoes.values())
    for (const fase of FASES)
      for (const linha of ["f", "m"] as const) {
        const opcao = catalogo.opcoes.find(
          (o) =>
            o.cabelo === referencia.cabelo &&
            o.roupa === referencia.roupa &&
            o.fase === fase &&
            o.linha === linha,
        );
        if (!opcao)
          throw new Error(
            `Aparência sem continuidade: ${referencia.cabelo}/${referencia.roupa}/${fase}/${linha}`,
          );
        if (
          JSON.stringify(Object.keys(opcao.edicaoInicial.coresDaRoupa).sort()) !==
          JSON.stringify(Object.keys(referencia.edicaoInicial.coresDaRoupa).sort())
        )
          throw new Error(
            `Partes da roupa sem continuidade: ${referencia.cabelo}/${referencia.roupa}/${fase}/${linha}`,
          );
      }
}
