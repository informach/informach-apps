import { db } from "@informach/db";
import { recreioProfiles } from "@informach/db/schema";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

/**
 * A conta é compartilhada: desativar a exclusão só no Recreio não impede
 * a cascata iniciada por outro app. Até existir sucessão/saída dos mundos,
 * o pedido de quem tem perfil no Recreio precisa de atendimento assistido.
 * Falha de leitura aborta a exclusão, antes de qualquer limpeza de cobrança.
 */
export async function assertAccountDeletionReady(userId: string): Promise<void> {
  const [perfil] = await db
    .select({ id: recreioProfiles.id })
    .from(recreioProfiles)
    .where(eq(recreioProfiles.userId, userId))
    .limit(1);
  if (perfil)
    throw new APIError("CONFLICT", {
      code: "RECREIO_ACCOUNT_DELETION_REQUIRES_SUPPORT",
      message: "Sua conta participa do Recreio. Fale com o suporte para concluir a exclusão.",
    });
}
