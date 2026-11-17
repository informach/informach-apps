import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { travarMundoAntesDosPerfis } from "./ordem-de-travas-repository";
import type { AutorDaSaida } from "./saida-repository";

/** Somente o adapter servidor preenche esta prova a partir do Better Auth. */
export type LoginDaResponsabilidade = {
  authSessionId: string;
  criadoEm: Date;
  expiraEm: Date;
};
export type AutorDaResponsabilidade = AutorDaSaida & { login: LoginDaResponsabilidade };
const LOGIN_RECENTE_MS = 10 * 60_000;
export async function limitarGestao(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout = '5s'`);
  await tx.execute(sql`set local lock_timeout = '1s'`);
  await tx.execute(sql`set local transaction_timeout = '15s'`);
}

/** A prova não é um campo HTTP; seu ID deve coincidir com o login do aparelho travado. */
export async function contextoDaGestao(
  tx: Transacao,
  autor: AutorDaResponsabilidade,
  mundoId: string,
  outroMembroId: string,
) {
  const [vinculo] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.spaceId, mundoId), eq(members.profileId, autor.perfilId)));
  assertAllowed(vinculo, "MUNDO", "Mundo indisponível.");
  // Descobrir apenas o vínculo necessário; a autoridade será relida sob as travas.
  const [outroAntes] = await tx
    .select({ perfilId: members.profileId })
    .from(members)
    .where(and(eq(members.id, outroMembroId), eq(members.spaceId, mundoId)));
  assertAllowed(outroAntes, "MUNDO", "Participação indisponível.");
  await travarMundoAntesDosPerfis(tx, autor.perfilId, mundoId, "update");
  const perfis = await tx
    .select({
      id: profiles.id,
      contaId: profiles.userId,
      tipo: profiles.kind,
      estado: profiles.status,
    })
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        outroAntes.perfilId ? [autor.perfilId, outroAntes.perfilId] : [autor.perfilId],
      ),
    )
    .orderBy(asc(profiles.id))
    .for("share");
  const perfil = perfis.find((item) => item.id === autor.perfilId);
  assertAllowed(
    perfil?.contaId === autor.contaId && perfil.tipo === "adult" && perfil.estado === "active",
    "AUTH",
    "Entre no seu perfil adulto para continuar.",
  );
  const outroPerfil = perfis.find((item) => item.id === outroAntes.perfilId);
  const outroAdulto = outroPerfil?.tipo === "adult" && outroPerfil.estado === "active";
  const [aparelho] = await tx
    .select({ id: devices.id, authSessionId: devices.authSessionId, expiraEm: devices.expiresAt })
    .from(devices)
    .where(
      and(
        eq(devices.id, autor.sessaoDeAparelhoId),
        eq(devices.userId, autor.contaId),
        eq(devices.activeProfileId, autor.perfilId),
        eq(devices.kind, "account"),
        isNull(devices.revokedAt),
      ),
    )
    .for("share");
  assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
  const [mundo] = await tx
    .select({ id: spaces.id, responsavel: spaces.stewardProfileId, estado: spaces.status })
    .from(spaces)
    .where(and(eq(spaces.id, mundoId), ne(spaces.status, "deleted")))
    .for("update");
  assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
  const vinculos = await tx
    .select()
    .from(members)
    .where(and(eq(members.spaceId, mundo.id), inArray(members.id, [vinculo.id, outroMembroId])))
    .orderBy(asc(members.id))
    .for("update");
  const proprio = vinculos.find((item) => item.id === vinculo.id);
  const outro = vinculos.find((item) => item.id === outroMembroId);
  assertAllowed(proprio?.profileId === perfil.id, "MUNDO", "Participação indisponível.");
  assertAllowed(
    outro && outro.profileId === outroAntes.perfilId && outro.id !== proprio.id,
    "MUNDO",
    "Participação indisponível.",
  );
  const conferirPrazo = async (recente: boolean) => {
    const [linha] = await tx
      .select({ agora: sql<Date>`${AGORA}`.mapWith(spaces.createdAt) })
      .from(spaces)
      .where(eq(spaces.id, mundoId));
    assertAllowed(linha, "AUTH", "Entre novamente para continuar.");
    const agora = linha.agora;
    assertAllowed(
      aparelho.authSessionId === autor.login.authSessionId &&
        aparelho.expiraEm > agora &&
        autor.login.expiraEm > agora,
      "AUTH",
      "Entre novamente para continuar.",
    );
    if (recente)
      assertAllowed(
        Number.isFinite(autor.login.criadoEm.getTime()) &&
          autor.login.criadoEm <= agora &&
          agora.getTime() - autor.login.criadoEm.getTime() < LOGIN_RECENTE_MS,
        "LOGIN_RECENTE",
        "Entre novamente para confirmar esta mudança no mundo.",
      );
    return agora;
  };
  await conferirPrazo(false);
  return { mundo, proprio, outro, outroAdulto, conferirPrazo };
}
