import "server-only";
import { and, asc, db, eq, gt, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { type MembroId, MembroIdSchema, MundoIdSchema } from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import type { AutorDaSaida } from "./saida-repository";

export const PARTICIPACOES_POR_PAGINA = 20;

/** Gestão do próprio vínculo, sem depender de concessão comercial ou acesso ao conteúdo. */
export async function listarParticipacoesProprias(autor: AutorDaSaida, apos: MembroId | null) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.execute(sql`set local transaction_timeout = '15s'`);
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
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.id, autor.sessaoDeAparelhoId),
          eq(devices.userId, autor.contaId),
          eq(devices.kind, "account"),
          eq(devices.activeProfileId, perfil.id),
          isNull(devices.revokedAt),
        ),
      )
      .for("share");
    assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
    // Conferir o relógio depois de esperar pelas duas autoridades.
    const [prazo] = await tx
      .select({ valido: sql<boolean>`${devices.expiresAt} > ${AGORA}` })
      .from(devices)
      .where(eq(devices.id, aparelho.id));
    assertAllowed(prazo?.valido, "AUTH", "Entre novamente para continuar.");
    const linhas = await tx
      .select({
        id: members.id,
        mundoId: spaces.id,
        nome: spaces.name,
        papel: members.role,
        estado: members.state,
        estadoDoMundo: spaces.status,
      })
      .from(members)
      .innerJoin(spaces, eq(spaces.id, members.spaceId))
      .where(
        and(
          eq(members.profileId, perfil.id),
          ne(members.state, "former"),
          ne(spaces.status, "deleted"),
          apos ? gt(members.id, apos) : undefined,
        ),
      )
      .orderBy(asc(members.id))
      .limit(PARTICIPACOES_POR_PAGINA + 1);
    const itens = linhas.slice(0, PARTICIPACOES_POR_PAGINA).map((linha) => ({
      ...linha,
      id: MembroIdSchema.parse(linha.id),
      mundoId: MundoIdSchema.parse(linha.mundoId),
    }));
    const ultimo = itens.at(-1);
    return {
      itens,
      proximo: linhas.length > PARTICIPACOES_POR_PAGINA && ultimo ? ultimo.id : null,
    };
  });
}
