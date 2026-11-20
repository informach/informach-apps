import { z } from "zod";
/** Só classificadores públicos fixos. Nunca transportar mensagem/cause/SQL,
 * nomes de arquivo, parâmetros, conteúdo ou chaves através deste recibo. */
export const FalhaDaRecuperacaoSchema = z.strictObject({
  ok: z.literal(false),
  etapa: z.enum([
    "LEITURA",
    "CONEXAO_DE_INSPECAO",
    "MANIFESTO",
    "INJETAR_QUEDA",
    "ENCERRAR_CLIENTE",
    "REMOVER_SONDA",
    "CONFERIR_ROLLBACK",
    "NORMALIZAR",
    "CORROMPER_FOTO",
    "RECUSAR_CORRUPCAO",
    "REPETIR",
    "CAPACIDADES",
    "FONTES_HISTORICAS",
    "LIMPEZA",
  ]),
  codigo: z.enum([
    "EXECUTOR",
    "CONFIGURACAO_INVALIDA",
    "PROVA_MANIFESTO_DIVERGENTE_ADMITIDO",
    "PROVA_QUEDA_DE_CONEXAO_NAO_EXERCITADA",
    "PROVA_SEM_FOTOGRAFIA",
    "PROVA_FOTOGRAFIA_NORMALIZADA_AUSENTE",
    "PROVA_CORRUPCAO_NAO_CLASSIFICADA",
    "PROVA_CORRUPCAO_SOBRESCRITA",
    "PROVA_NORMALIZACAO_NAO_REPETIVEL",
    "PROVA_CAPACIDADES_SINTETICAS_AUSENTES",
    "PROVA_HISTORICO_DE_CAPACIDADES_INVALIDO",
    "PROVA_CAPACIDADES_ROLLBACK_NAO_EXERCITADO",
    "PROVA_HISTORICO_DE_CAPACIDADES_ALTERADO",
    "PROVA_CAPACIDADES_RESTANTES",
    "INVENTARIO_FORMATO_DIVERGENTE",
    "INVENTARIO_VERSAO_DIVERGENTE",
    "INVENTARIO_ESTRUTURA_DIVERGENTE",
    "INVENTARIO_DADOS_DIVERGENTES",
    "INVENTARIO_CATALOGO_NAO_SUPORTADO",
    "LIMPEZA",
    "NORMAL_DESTINO_NAO_PRIVADO",
    "NORMAL_PERFIL_NAO_SUPORTADO",
    "NORMAL_INVENTARIO",
    "NORMAL_VINCULO",
    "NORMAL_INTEGRIDADE",
    "SQL_23514",
    "SQL_RECOVERY_HASHES",
    "SQL_RECOVERY_KEYS",
    "SQL_RECOVERY_STATE",
    "SQL_RECOVERY_TIMES",
    "SQL_RECOVERY_KIND",
    "SQL_RECOVERY_REFERENCE",
    "SQL_RECOVERY_PLAN",
    "SQL_RECOVERY_WORLDS",
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
export type EtapaDaRecuperacao = z.infer<typeof FalhaDaRecuperacaoSchema>["etapa"];

/** Fixed diagnostic vocabulary; never expose arbitrary provider messages,
 * details, relation/constraint names, values, SQL or bind parameters. */
export function classificarRestricaoDeRecuperacao(erro: unknown): CodigoDaRecuperacao | undefined {
  if (
    !erro ||
    typeof erro !== "object" ||
    !("code" in erro) ||
    erro.code !== "23514" ||
    !("constraint_name" in erro)
  )
    return undefined;
  switch (erro.constraint_name) {
    case "recreio_rights_recovery_hashes":
      return "SQL_RECOVERY_HASHES";
    case "recreio_rights_recovery_keys":
      return "SQL_RECOVERY_KEYS";
    case "recreio_rights_recovery_state":
      return "SQL_RECOVERY_STATE";
    case "recreio_rights_recovery_times":
      return "SQL_RECOVERY_TIMES";
    case "recreio_rights_recovery_source_kind":
      return "SQL_RECOVERY_KIND";
    case "recreio_rights_recovery_source_reference":
      return "SQL_RECOVERY_REFERENCE";
    case "recreio_rights_recovery_source_plan":
      return "SQL_RECOVERY_PLAN";
    case "recreio_rights_recovery_source_worlds":
      return "SQL_RECOVERY_WORLDS";
    default:
      return undefined;
  }
}
