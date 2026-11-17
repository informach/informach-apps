import { MesEAnoSchema, VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { z } from "zod";
import { NovoPerfilSchema } from "@/features/perfis/regras";

export const CadastroDeMenorSchema = z.strictObject({
  intencaoId: z.uuid(),
  perfil: NovoPerfilSchema,
  nascimento: MesEAnoSchema,
  assumoResponsabilidade: z.literal(true),
  versaoDaDeclaracao: z.literal(VERSAO_DA_RESPONSABILIDADE),
});
export type CadastroDeMenor = z.infer<typeof CadastroDeMenorSchema>;
