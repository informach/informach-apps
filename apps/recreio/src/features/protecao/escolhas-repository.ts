import "server-only";
import { and, db, eq, isNotNull, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGuardianLinks as guardians,
  recreioNativePins as pins,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import {
  type IdentidadeNativa,
  lerContaNativa,
  validarIdentidadeDaSessaoNativa,
} from "@/features/account/autoridade-repository";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { assertAllowed } from "@/lib/errors";

/** Lista de escolhas não é autoridade de gestão: PIN do destino ainda é obrigatório. */
export async function lerEscolhasDoAparelho(autor: IdentidadeNativa) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    const conta = await lerContaNativa(tx, autor.contaId);
    const [pin] = await tx
      .select({ id: pins.userId })
      .from(pins)
      .where(eq(pins.userId, autor.contaId))
      .for("share");
    const [aparelho] = await tx
      .select()
      .from(devices)
      .where(eq(devices.id, autor.sessaoDeAparelhoId))
      .for("share");
    assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
    await validarIdentidadeDaSessaoNativa(tx, autor, conta, aparelho);
    const [adulto] = await tx
      .select({ id: profiles.id, apelido: profiles.nickname, avatar: profiles.avatar })
      .from(profiles)
      .where(
        and(
          eq(profiles.userId, autor.contaId),
          eq(profiles.kind, "adult"),
          eq(profiles.status, "active"),
        ),
      );
    const menores =
      novosPerfisProtegidosDisponiveis && pin
        ? await tx
            .select({ id: profiles.id, apelido: profiles.nickname, avatar: profiles.avatar })
            .from(guardians)
            .innerJoin(profiles, eq(profiles.id, guardians.profileId))
            .innerJoin(
              protection,
              and(
                eq(protection.profileId, profiles.id),
                eq(protection.guardianLinkId, guardians.id),
              ),
            )
            .where(
              and(
                eq(guardians.guardianUserId, autor.contaId),
                eq(profiles.kind, "minor"),
                eq(profiles.status, "active"),
                isNotNull(protection.pinHash),
              ),
            )
            .orderBy(profiles.createdAt, profiles.id)
            .limit(20)
        : [];
    await validarIdentidadeDaSessaoNativa(tx, autor, conta, aparelho);
    return {
      restrito: aparelho.minorContextGeneration !== null,
      atualId: aparelho.activeProfileId,
      pinDaContaDefinido: Boolean(pin),
      adulto: adulto ?? null,
      menores,
    };
  });
}
