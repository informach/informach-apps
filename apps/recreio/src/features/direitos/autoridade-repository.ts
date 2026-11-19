import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  lerContaNativa,
} from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { type Transacao, travar } from "@/lib/repository";

/** Leitura pessoal própria/parental, não autoridade para conteúdo compartilhado
 * ou exclusão. Sem I/O externo no callback. O jogo opcional toma o mutex comum
 * de progresso/conquistas antes do aparelho; inventário de IDs não captura bytes. */
export async function comPerfilPessoal<T>(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  jogo: string | null,
  executar: (
    tx: Transacao,
    perfil: typeof profiles.$inferSelect,
    conferirPrazo: () => Promise<Date>,
  ) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await lerContaNativa(tx, autor.contaId);
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
      .for("share");
    const [perfil] = await tx.select().from(profiles).where(eq(profiles.id, perfilId)).for("share");
    const [vinculo] =
      perfil?.kind === "minor"
        ? await tx
            .select({ id: guardians.id })
            .from(guardians)
            .where(
              and(eq(guardians.profileId, perfil.id), eq(guardians.guardianUserId, autor.contaId)),
            )
            .for("share")
        : [];
    assertAllowed(
      perfil && (perfil.kind === "adult" ? perfil.userId === autor.contaId : vinculo),
      "PERFIL",
      "Perfil não disponível.",
    );
    // Suspensão do jogador e cobertura comercial não extinguem direitos pessoais.
    if (jogo !== null) await travar(tx, `dados-perfil:${perfil.id}:${jogo}`);
    const nativa = await autorizarContaNativa(tx, autor);
    const conferirPrazo = () => nativa.conferirPrazo(autor.login);
    await conferirPrazo();
    const resultado = await executar(tx, perfil, conferirPrazo);
    await conferirPrazo();
    return resultado;
  });
}
