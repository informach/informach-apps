import { z } from "zod";
import { IntencaoSchema } from "./comandos/intencao";
import { VERSAO_DO_PROTOCOLO } from "./protocolo-constantes";

export const MensagemDoClienteSchema = z.discriminatedUnion("t", [
  /** Sempre o primeiro quadro. A sessão vai aqui, nunca no endereço. */
  z.strictObject({
    t: z.literal("entrar"),
    v: z.union([z.literal(1), z.literal(VERSAO_DO_PROTOCOLO)]),
    sessao: z.string().min(1).max(4096),
    mundoId: z.string().min(1).max(64),
  }),
  z.strictObject({ t: z.literal("intencao"), intencao: IntencaoSchema }),
  /** A sessão foi renovada no Recreio: o servidor passa a valer pelo prazo novo. */
  z.strictObject({ t: z.literal("renovar_sessao"), sessao: z.string().min(1).max(4096) }),
  z.strictObject({ t: z.literal("pulso"), n: z.number().int().nonnegative() }),
  /** Sair de propósito: o servidor salva e confirma antes de fechar. */
  z.strictObject({ t: z.literal("sair") }),
]);
export type MensagemDoCliente = z.infer<typeof MensagemDoClienteSchema>;
