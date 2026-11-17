import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema } from "../dominio/ids";

export const ConsultaDeParticipantesSchema = z.strictObject({
  mundoId: MundoIdSchema,
  apos: PerfilIdSchema.optional(),
});
export const ParticipanteDoMundoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  apelido: z.string().max(20).nullable(),
  avatar: z.string().max(64).nullable(),
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
});
export const ParticipantesDoMundoSchema = z.strictObject({
  participantes: z.array(ParticipanteDoMundoSchema).max(10),
  proximo: PerfilIdSchema.nullable(),
});
export type ParticipanteDoMundo = z.infer<typeof ParticipanteDoMundoSchema>;
export type ParticipantesDoMundo = z.infer<typeof ParticipantesDoMundoSchema>;
