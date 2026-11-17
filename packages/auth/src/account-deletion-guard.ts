import { db } from "@informach/db";
import { recreioGroups, recreioGuardianLinks, recreioProfiles } from "@informach/db/schema";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

/**
 * A conta é compartilhada: desativar a exclusão só no Recreio não impede
 * a exclusão iniciada por outro app. Perfil, grupo próprio (mesmo sem jogador)
 * e responsabilidade infantil precisam de resolução assistida. As FKs RESTRICT
 * impedem cascata concorrente; este leitor dá a recusa antes da limpeza externa.
 * Falha de leitura aborta a exclusão, antes de qualquer limpeza de cobrança.
 */
export async function assertAccountDeletionReady(userId: string): Promise<void> {
  const [perfis, grupos, responsabilidades] = await Promise.all([
    db
      .select({ id: recreioProfiles.id })
      .from(recreioProfiles)
      .where(eq(recreioProfiles.userId, userId))
      .limit(1),
    db
      .select({ id: recreioGroups.id })
      .from(recreioGroups)
      .where(eq(recreioGroups.ownerUserId, userId))
      .limit(1),
    db
      .select({ id: recreioGuardianLinks.id })
      .from(recreioGuardianLinks)
      .where(eq(recreioGuardianLinks.guardianUserId, userId))
      .limit(1),
  ]);
  if (perfis.length || grupos.length || responsabilidades.length)
    throw new APIError("CONFLICT", {
      code: "RECREIO_ACCOUNT_DELETION_REQUIRES_SUPPORT",
      message: "Sua conta participa do Recreio. Fale com o suporte para concluir a exclusão.",
    });
}
