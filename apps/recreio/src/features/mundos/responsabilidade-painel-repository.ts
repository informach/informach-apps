import "server-only";
import { and, asc, db, eq, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaceStewardshipRequests as requests,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { travarMundoAntesDosPerfis } from "./ordem-de-travas-repository";
import type { AutorDaSaida } from "./saida-repository";

/** Metadados do próprio vínculo; cobertura comercial não é autoridade de gestão. */
export async function lerPainelDeResponsabilidade(autor: AutorDaSaida, mundoId: string) {
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
    const responsavel = proprio.papel === "steward" && mundo.responsavel === perfil.id;
    const candidatos = responsavel
      ? await tx
          .select({ id: members.id, apelido: profiles.nickname })
          .from(members)
          .innerJoin(profiles, eq(profiles.id, members.profileId))
          .where(
            and(
              eq(members.spaceId, mundo.id),
              ne(members.id, proprio.id),
              ne(members.state, "former"),
              eq(profiles.kind, "adult"),
              eq(profiles.status, "active"),
            ),
          )
          .orderBy(asc(members.id))
          .limit(100)
      : [];
    const [pendente] = await tx
      .select({
        id: requests.id,
        de: requests.fromMemberId,
        para: requests.toMemberId,
        expiraEm: requests.expiresAt,
        vigente: sql<boolean>`${requests.expiresAt} > ${AGORA}`,
      })
      .from(requests)
      .where(
        and(
          eq(requests.spaceId, mundo.id),
          eq(requests.state, "pending"),
          responsavel ? eq(requests.fromMemberId, proprio.id) : eq(requests.toMemberId, proprio.id),
        ),
      )
      .limit(1);
    return {
      mundo: { id: mundo.id, nome: mundo.nome },
      responsavel,
      podeTransferir: mundo.estado === "active" || mundo.estado === "hibernating",
      candidatos,
      proposta: pendente
        ? {
            id: pendente.id,
            recebida: pendente.para === proprio.id,
            destinatario: responsavel
              ? (candidatos.find((item) => item.id === pendente.para)?.apelido ?? null)
              : null,
            expiraEm: pendente.expiraEm,
            vigente: pendente.vigente,
          }
        : null,
    };
  });
}
