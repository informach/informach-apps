import { z } from "zod";
import {
  ChaveDeDadosSchema,
  GravacaoDeDadosSchema,
  LIMITES_DOS_DADOS,
  RevisaoDeDadosSchema,
} from "./dados";

/** 16 valores de 64 KiB em base64, metadados e margem de JSON, sem corpo ilimitado. */
export const SALVAMENTO_CORPO_MAX_BYTES = 2 * 1024 * 1024;
export const CapacidadeDeSalvamentoSchema = z.strictObject({
  token: z.string().min(1),
  expiraEm: z.iso.datetime(),
});
export const PedidoDeSalvamentoDePerfilSchema = z.strictObject({
  dados: z
    .array(GravacaoDeDadosSchema)
    .max(LIMITES_DOS_DADOS.chaves)
    .refine(
      (dados) => new Set(dados.map((dado) => dado.chave)).size === dados.length,
      "Cada chave deve aparecer uma única vez.",
    ),
});
export type PedidoDeSalvamentoDePerfil = z.infer<typeof PedidoDeSalvamentoDePerfilSchema>;
export const ResultadoDeSalvamentoSchema = z.strictObject({
  estado: z.enum(["completed", "conflicted"]),
  resultados: z
    .array(
      z.strictObject({
        chave: ChaveDeDadosSchema,
        revisao: RevisaoDeDadosSchema,
        conflitoId: z.uuid().optional(),
      }),
    )
    .max(LIMITES_DOS_DADOS.chaves),
});
export type ResultadoDeSalvamento = z.infer<typeof ResultadoDeSalvamentoSchema>;
export const EstadoDeSalvamentoSchema = z.strictObject({
  estado: z.enum(["ready", "completed", "conflicted"]),
  expiraEm: z.iso.datetime(),
});
export type EstadoDeSalvamento = z.infer<typeof EstadoDeSalvamentoSchema>;
