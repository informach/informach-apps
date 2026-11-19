import { z } from "zod";
import { DestinoDeCapturaSchema } from "@/features/backup/contrato";

export const TrabalhoDeColetaSchema = z
  .strictObject({
    id: z.uuid(),
    token: z.uuid(),
    mundoId: z.uuid(),
    destino: DestinoDeCapturaSchema,
    cipherSha256: z.string().regex(/^[a-f0-9]{64}$/),
    objectKey: z.string().max(200),
  })
  .refine((v) => v.objectKey === `recreio/v1/fotografia/${v.mundoId}/${v.cipherSha256}`);
export type TrabalhoDeColeta = z.infer<typeof TrabalhoDeColetaSchema>;
export class FalhaDaColeta extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "FONTE" | "TENTATIVA" | "LIMITE" | "INCONCLUSIVO") {
    super(`recreio.object_collection.${codigo}`);
  }
}
export function conferirTrabalhoDeColeta(bruto: TrabalhoDeColeta) {
  const r = TrabalhoDeColetaSchema.safeParse(bruto);
  if (!r.success) throw new FalhaDaColeta("CONFIGURACAO");
  return r.data;
}
