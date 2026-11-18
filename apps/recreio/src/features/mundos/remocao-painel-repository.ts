import "server-only";
import { and, asc, db, eq, gt, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { travarMundoAntesDosPerfis } from "./ordem-de-travas-repository";
import type { AutorDaSaida } from "./saida-repository";

/** Somente o responsável atual lê a lista de gestão; nunca depende de assinatura. */
export async function listarMembrosGerenciaveis(
  autor: AutorDaSaida,
  mundoId: string,
  apos: string | null,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.execute(sql`set local transaction_timeout = '15s'`);
    await travarMundoAntesDosPerfis(tx, autor.perfilId, mundoId, "share");
    const [perfil] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.id, autor.perfilId),
          eq(profiles.userId, autor.contaId),
          eq(profiles.kind, "adult"),
          eq(profiles.status, "active"),
        ),
      )
      .for("share");
    assertAllowed(perfil, "AUTH", "Entre no seu perfil adulto para continuar.");
    const [aparelho] = await tx
      .select({ id: devices.id, expiraEm: devices.expiresAt })
      .from(devices)
      .where(
        and(
          eq(devices.id, autor.sessaoDeAparelhoId),
          eq(devices.userId, autor.contaId),
          eq(devices.activeProfileId, perfil.id),
          eq(devices.kind, "account"),
          isNull(devices.revokedAt),
        ),
      )
      .for("share");
    assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
    const [vinculo] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.spaceId, mundoId),
          eq(members.profileId, perfil.id),
          ne(members.state, "former"),
        ),
      );
    assertAllowed(vinculo, "MUNDO", "Mundo indisponível.");
    const [mundo] = await tx
      .select({
        id: spaces.id,
        nome: spaces.name,
        estado: spaces.status,
        responsavel: spaces.stewardProfileId,
      })
      .from(spaces)
      .where(and(eq(spaces.id, mundoId), ne(spaces.status, "deleted")))
      .for("share");
    assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
    const [proprio] = await tx
      .select({ id: members.id, papel: members.role })
      .from(members)
      .where(
        and(
          eq(members.id, vinculo.id),
          eq(members.profileId, perfil.id),
          ne(members.state, "former"),
        ),
      )
      .for("share");
    assertAllowed(proprio, "MUNDO", "Mundo indisponível.");
    const [prazo] = await tx
      .select({ valido: sql<boolean>`${devices.expiresAt} > ${AGORA}` })
      .from(devices)
      .where(eq(devices.id, aparelho.id));
    assertAllowed(prazo?.valido, "AUTH", "Entre novamente para continuar.");
    assertAllowed(
      proprio.papel === "steward" && mundo.responsavel === perfil.id,
      "RESPONSAVEL",
      "Somente o responsável atual pode gerenciar os membros deste mundo.",
    );
    const linhas = await tx
      .select({ id: members.id, apelido: profiles.nickname, estado: members.state })
      .from(members)
      .leftJoin(profiles, eq(profiles.id, members.profileId))
      .where(
        and(
          eq(members.spaceId, mundo.id),
          ne(members.id, proprio.id),
          ne(members.role, "steward"),
          ne(members.state, "former"),
          apos ? gt(members.id, apos) : undefined,
        ),
      )
      .orderBy(asc(members.id))
      .limit(21);
    const [final] = await tx
      .select({ valido: sql<boolean>`${devices.expiresAt} > ${AGORA}` })
      .from(devices)
      .where(eq(devices.id, aparelho.id));
    assertAllowed(final?.valido, "AUTH", "Entre novamente para continuar.");
    const itens = linhas.slice(0, 20);
    return {
      mundo: { id: mundo.id, nome: mundo.nome },
      itens,
      proximo: linhas.length > 20 ? (itens.at(-1)?.id ?? null) : null,
    };
  });
}
