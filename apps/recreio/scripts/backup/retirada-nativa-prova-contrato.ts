import { z } from "zod";

const MundoDoEncerramentoSchema = z.strictObject({
  mundoId: z.uuid(),
  retiradoId: z.uuid(),
  preservadoId: z.uuid(),
  diarioFinal: z.number().int().min(1).max(1000),
  tickFinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  versao: z.number().int().min(1).max(3),
  familiasSha256: z.string().regex(/^[a-f0-9]{64}$/),
  acessoSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Synthetic fixture coordinates, never an authorization or a production input. */
export const RetiradaNativaDeProvaSchema = z.strictObject({
  livroId: z.uuid(),
  operacaoId: z.uuid(),
  perfilId: z.uuid(),
  contaId: z.string().min(1).max(256),
  financeiro: z.strictObject({
    livroId: z.uuid(),
    operacaoId: z.uuid(),
    contaId: z.string().min(1).max(256),
    perfisSelecionados: z.array(z.uuid()).length(2),
    mundo: MundoDoEncerramentoSchema,
    anterior: z.strictObject({ operacaoId: z.uuid(), contaId: z.string().min(1).max(256) }),
    publicacaoPendente: z.strictObject({
      operacaoId: z.uuid(),
      contaId: z.string().min(1).max(256),
    }),
    posterior: z.strictObject({ operacaoId: z.uuid(), contaId: z.string().min(1).max(256) }),
    posteriorComSelecao: z.strictObject({
      operacaoId: z.uuid(),
      contaId: z.string().min(1).max(256),
      perfisSelecionados: z.array(z.uuid()).length(2),
      mundo: MundoDoEncerramentoSchema,
    }),
    provedor: z.strictObject({
      operacaoId: z.uuid(),
      contaId: z.string().min(1).max(256),
      clienteStripeId: z.string().regex(/^cus_recovery_[a-f0-9]{32}$/),
    }),
    chaves: z.strictObject({
      "finance-old": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
      "finance-next": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
    }),
  }),
  publicacaoPendente: z.strictObject({
    operacaoId: z.uuid(),
    perfilId: z.uuid(),
    contaId: z.string().min(1).max(256),
  }),
  anterior: z.strictObject({
    operacaoId: z.uuid(),
    perfilId: z.uuid(),
    contaId: z.string().min(1).max(256),
  }),
  preservadoId: z.uuid(),
  mundoId: z.uuid(),
  diarioFinal: z.number().int().min(1).max(1000),
  tickFinal: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  familiasFinaisSha256: z.string().regex(/^[a-f0-9]{64}$/),
  acessoFinalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  chaves: z.strictObject({
    "native-old": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
    "native-next": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  }),
});
export type RetiradaNativaDeProva = z.infer<typeof RetiradaNativaDeProvaSchema>;
