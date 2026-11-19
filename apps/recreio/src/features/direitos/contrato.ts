import { PerfilIdSchema } from "@informach/recreio";
import type { VersaoDeDadosHttp } from "@informach/recreio/contrato";
import { z } from "zod";

/** Recorte pessoal por jogo, inclusive um título que já saiu do catálogo. */
export const PedidoDeCopiaDoJogoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  jogo: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
});
export type PedidoDeCopiaDoJogo = z.infer<typeof PedidoDeCopiaDoJogoSchema>;

/** Este recorte não representa a exportação completa da conta ou de um mundo. */
export interface CopiaPessoalDoJogo {
  formato: "recreio-dados-pessoais-do-jogo-v1";
  escopo: "progresso-versoes-conflitos-conquistas";
  perfilId: string;
  jogo: string;
  conferidoEm: string;
  chaves: {
    chave: string;
    revisaoAtual: number;
    versoes: (VersaoDeDadosHttp & { sha256: string })[];
  }[];
  conquistas: { id: string; obtidaEm: string }[];
}
