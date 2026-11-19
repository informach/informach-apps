import { z } from "zod";

const id = z.uuid().refine((v) => v === v.toLowerCase());
const ids = z
  .array(id)
  .max(256)
  .refine((v) => v.every((item, i) => i === 0 || (v[i - 1] ?? "") < item));

/** Referência privada do cliente exclusivo do Recreio, nunca do formulário.
 * O executor ainda confere origem e namespace no provedor; este plano não é
 * evidência de cancelamento, pagamento ou ausência de operações remotas. */
export const FinanceiroDoEncerramentoSchema = z.strictObject({
  formato: z.literal("recreio-encerramento-financeiro-v1"),
  modo: z.enum(["dev", "prod"]),
  efeito: z.literal("cancelar-renovacoes-e-checkouts-pendentes"),
  periodosPagosPreservados: z.literal(true),
  registrosFinanceirosPreservados: z.literal(true),
  contratosDeOutrosAdultosPreservados: z.literal(true),
  clientes: z
    .array(
      z.strictObject({
        id,
        referenciaStripe: z.string().regex(/^cus_[A-Za-z0-9]{3,124}$/),
      }),
    )
    .max(1),
  /** Apenas autorizações comprovadamente não enviadas podem ser encerradas
   * localmente. Uma tentativa já admitida exige conciliação própria. */
  comprasNaoEnviadas: ids,
  trocasNaoEnviadas: ids,
});
export type FinanceiroDoEncerramento = z.infer<typeof FinanceiroDoEncerramentoSchema>;

/** Exige os três aceites, inclusive quando não há perfil ou contrato. Não
 * aceita IDs da conta, do cliente Stripe, segredo ou intenção trazida pelo cliente. */
export const AceiteDoEncerramentoSchema = z.strictObject({
  preparacaoId: z.uuid(),
  planoSha256: z.string().regex(/^[a-f0-9]{64}$/),
  confirmoEncerramento: z.literal(true),
  confirmoRetiradaDosPerfis: z.literal(true),
  confirmoCancelamentoDaRenovacao: z.literal(true),
});
