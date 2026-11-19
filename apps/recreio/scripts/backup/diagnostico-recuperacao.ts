import { z } from "zod";
/** Só classificadores públicos fixos. Nunca transportar mensagem/cause/SQL,
 * nomes de arquivo, parâmetros, conteúdo ou chaves através deste recibo. */
export const FalhaDaRecuperacaoSchema = z.strictObject({
  ok: z.literal(false),
  codigo: z.enum([
    "EXECUTOR",
    "LIMPEZA",
    "NORMAL_DESTINO_NAO_PRIVADO",
    "NORMAL_PERFIL_NAO_SUPORTADO",
    "NORMAL_INVENTARIO",
    "NORMAL_VINCULO",
    "NORMAL_INTEGRIDADE",
    "SQL_23514",
    "SQL_23503",
    "SQL_23001",
    "SQL_55P03",
    "SQL_57014",
    "SQL_42703",
    "SQL_42P01",
    "SQL_42601",
    "SQL_P0001",
    "SQL_57P01",
  ]),
  localCleanupConfirmed: z.boolean(),
  clusterCleanupConfirmed: z.boolean(),
});
export type CodigoDaRecuperacao = z.infer<typeof FalhaDaRecuperacaoSchema>["codigo"];
