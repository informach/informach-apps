import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

const idsOrdenados = z
  .array(PerfilIdSchema.refine((id) => id === id.toLowerCase()))
  .max(256)
  .refine(
    (ids) => ids.every((id, indice) => indice === 0 || (ids[indice - 1] ?? "") < id),
    "Escolha cada perfil uma vez, em ordem.",
  );
export const PedidoDePreparacaoDeDireitosSchema = z
  .strictObject({
    pedidoId: z.uuid(),
    tipo: z.enum(["retirar_perfil", "encerrar_conta"]),
    perfis: idsOrdenados,
  })
  .refine((p) => p.tipo !== "retirar_perfil" || p.perfis.length === 1);
export type PedidoDePreparacaoDeDireitos = z.infer<typeof PedidoDePreparacaoDeDireitosSchema>;

const contador = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const PlanoDeDireitosSchema = z
  .strictObject({
    formato: z.literal("recreio-previa-direitos-v1"),
    tipo: z.enum(["retirar_perfil", "encerrar_conta"]),
    contaId: z.string().min(1).max(256),
    perfis: z
      .array(
        z.strictObject({
          id: PerfilIdSchema,
          tipo: z.enum(["adult", "minor"]),
          versao: contador.min(1),
          responsabilidadeId: z.uuid().nullable(),
        }),
      )
      .max(256),
    mundos: z
      .array(
        z.strictObject({
          id: z.uuid(),
          jogo: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
          revisao: contador,
          diario: contador,
          gestao: contador.min(1),
          cerca: contador,
          estado: z.enum(["active", "hibernating", "archived", "deleted"]),
          outrosParticipantes: contador,
        }),
      )
      .max(512),
    /** Cobrança/identidade global não são efeitos implícitos deste pedido. */
    identidadeGlobalPreservada: z.literal(true),
    financeiroSeparado: z.literal(true),
  })
  .refine(
    (plano) =>
      (plano.tipo !== "retirar_perfil" || plano.perfis.length === 1) &&
      plano.perfis.every(
        (p, i) =>
          p.id === p.id.toLowerCase() &&
          (i === 0 || (plano.perfis[i - 1]?.id ?? "") < p.id) &&
          (p.tipo === "minor" ? p.responsabilidadeId !== null : p.responsabilidadeId === null),
      ) &&
      plano.mundos.every(
        (m, i) =>
          m.id === m.id.toLowerCase() && (i === 0 || (plano.mundos[i - 1]?.id ?? "") < m.id),
      ),
  );
export type PlanoDeDireitos = z.infer<typeof PlanoDeDireitosSchema>;
export const ReferenciaDaPreparacaoSchema = z.strictObject({
  preparacaoId: z.uuid(),
  planoSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ReferenciaDaPreparacao = z.infer<typeof ReferenciaDaPreparacaoSchema>;
