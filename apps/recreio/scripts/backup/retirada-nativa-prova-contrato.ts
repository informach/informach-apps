import { z } from "zod";

/** Synthetic fixture coordinates, never an authorization or a production input. */
export const RetiradaNativaDeProvaSchema = z.strictObject({
  livroId: z.uuid(),
  operacaoId: z.uuid(),
  perfilId: z.uuid(),
  contaId: z.string().min(1).max(256),
  preservadoId: z.uuid(),
  mundoId: z.uuid(),
  chaves: z.strictObject({
    "native-old": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
    "native-next": z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  }),
});
export type RetiradaNativaDeProva = z.infer<typeof RetiradaNativaDeProvaSchema>;
