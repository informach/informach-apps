import { z } from "zod";
import { doCatalogo } from "../conteudo";

const centavos = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const OfertaDeMovelSchema = z
  .strictObject({
    catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    versaoDoCatalogo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    rotulo: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[^\p{Cc}]+$/u),
    compraCentavos: centavos.positive(),
    revendaCentavos: centavos,
  })
  .refine((oferta) => oferta.revendaCentavos <= oferta.compraCentavos, {
    message: "Revenda maior que a compra",
    path: ["revendaCentavos"],
  });
export type OfertaDeMovel = z.infer<typeof OfertaDeMovelSchema>;

export const CatalogoDaLojaSchema = z.strictObject({
  formato: z.literal("morada.loja"),
  versao: z.literal(1),
  politicaDePrecos: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ofertas: z.array(OfertaDeMovelSchema).max(256),
});
export type CatalogoDaLoja = z.infer<typeof CatalogoDaLojaSchema>;
export type MovelDisponivel = { catalogo: string; versaoDoCatalogo: number };

/** Catálogo da simulação e arte disponível são autoridades do host, nunca da intenção. */
export function conferirCatalogoDaLoja(
  bruto: unknown,
  disponiveis: readonly MovelDisponivel[],
): CatalogoDaLoja {
  const catalogo = CatalogoDaLojaSchema.parse(bruto);
  const vistos = new Set<string>();
  for (const oferta of catalogo.ofertas) {
    if (vistos.has(oferta.catalogo)) throw new Error("Oferta repetida no catálogo da loja");
    vistos.add(oferta.catalogo);
    const entrada = doCatalogo(oferta.catalogo);
    if (!entrada || entrada.versao !== oferta.versaoDoCatalogo)
      throw new Error("Oferta sem entrada compatível no catálogo da simulação");
    if (
      !disponiveis.some(
        (item) =>
          item.catalogo === oferta.catalogo && item.versaoDoCatalogo === oferta.versaoDoCatalogo,
      )
    )
      throw new Error("Oferta sem arte compatível disponível");
  }
  return catalogo;
}
