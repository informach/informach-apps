import { z } from "zod";
import { doCatalogo } from "../conteudo";

const rgb = z.number().int().min(0).max(0xffffff);
const perfil = z.string().regex(/^[0-9a-f]{64}$/);

/** `null` é a arte original; branco/preto escolhidos são cores explícitas. */
export const PinturaDoMovelSchema = z.strictObject({ perfil, cor: rgb });
export type PinturaDoMovel = z.infer<typeof PinturaDoMovelSchema>;

export const PerfilDePinturaSchema = z.strictObject({
  catalogo: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  versaoDoCatalogo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  perfil,
  rotulo: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[^\p{Cc}]+$/u),
  referencia: rgb,
});
export type PerfilDePintura = z.infer<typeof PerfilDePinturaSchema>;

export const CatalogoDePinturasSchema = z.strictObject({
  formato: z.literal("morada.pinturas"),
  versao: z.literal(1),
  perfis: z.array(PerfilDePinturaSchema).max(512),
});
export type CatalogoDePinturas = z.infer<typeof CatalogoDePinturasSchema>;

export type MovelPintado = { catalogo: string; versao: number; pintura: PinturaDoMovel | null };

/** Admissão feita pelo host a partir do manifesto homologado, sem preços ou URLs. */
export function conferirCatalogoDePinturas(bruto: unknown): CatalogoDePinturas {
  const catalogo = CatalogoDePinturasSchema.parse(bruto);
  const vistos = new Set<string>();
  for (const item of catalogo.perfis) {
    const chave = `${item.catalogo}@${item.versaoDoCatalogo}`;
    if (vistos.has(chave)) throw new Error("Perfil de pintura repetido para a mesma peça");
    vistos.add(chave);
    const entrada = doCatalogo(item.catalogo);
    if (!entrada || entrada.versao !== item.versaoDoCatalogo)
      throw new Error("Perfil de pintura incompatível com o catálogo da simulação");
  }
  return catalogo;
}

export function perfilDePintura(
  catalogo: CatalogoDePinturas | null,
  movel: Pick<MovelPintado, "catalogo" | "versao">,
): PerfilDePintura | null {
  return (
    catalogo?.perfis.find(
      (item) => item.catalogo === movel.catalogo && item.versaoDoCatalogo === movel.versao,
    ) ?? null
  );
}

/** Um mundo pintado não pode perder o perfil ao trocar de instância ou pacote. */
export function conferirDisponibilidadeDasPinturas(
  moveis: readonly MovelPintado[],
  admitido: CatalogoDePinturas | null,
  disponivel: CatalogoDePinturas | null,
): void {
  for (const movel of moveis) {
    if (movel.pintura === null) continue;
    const pintura = PinturaDoMovelSchema.parse(movel.pintura);
    const original = perfilDePintura(admitido, movel);
    const atual = perfilDePintura(disponivel, movel);
    if (
      !original ||
      !atual ||
      original.perfil !== pintura.perfil ||
      atual.perfil !== pintura.perfil
    )
      throw new Error("Pintura do mundo sem perfil admitido e disponível compatível");
  }
}
