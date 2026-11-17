import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  users,
} from "@informach/db/schema";
import type { ContaId, PerfilId } from "@informach/recreio";
import { paraPerfil } from "@/features/perfis/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";

export async function agoraDoBanco(tx: Transacao): Promise<Date> {
  const [linha] = await tx
    .select({ agora: sql<Date>`${AGORA}`.mapWith(users.createdAt) })
    .from(sql`(select 1) as clock_source`);
  assertAllowed(linha, "AUTH", "Não foi possível conferir a sessão.");
  return linha.agora;
}

/** A referência é só uma pista; todas as relações são relidas depois das travas. */
export async function autoridadeDoMenor(
  tx: Transacao,
  perfilId: PerfilId,
  responsavelId: ContaId,
  travaDoPerfil: "share" | "update" = "share",
) {
  const [responsavel] = await tx
    .select()
    .from(users)
    .where(eq(users.id, responsavelId))
    .for("share");
  const [perfil] = await tx
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, perfilId), eq(profiles.kind, "minor")))
    .for(travaDoPerfil);
  const [vinculo] = await tx
    .select()
    .from(guardians)
    .where(and(eq(guardians.profileId, perfilId), eq(guardians.guardianUserId, responsavelId)))
    .for("share");
  assertAllowed(
    responsavel?.emailVerified && perfil?.status === "active" && vinculo,
    "PERFIL",
    "Perfil não disponível.",
  );
  const conferirPrazo = async () => {
    const agora = await agoraDoBanco(tx);
    assertAllowed(
      !(responsavel.banned && (!responsavel.banExpiresAt || responsavel.banExpiresAt > agora)),
      "PERFIL",
      "Perfil não disponível.",
    );
    return agora;
  };
  await conferirPrazo();
  return { perfil: paraPerfil(perfil), vinculo, conferirPrazo };
}

export async function protecaoAtual(
  tx: Transacao,
  perfilId: PerfilId,
  vinculoId: string,
  modo: "share" | "update",
) {
  const [atual] = await tx
    .select()
    .from(protection)
    .where(eq(protection.profileId, perfilId))
    .for(modo);
  assertAllowed(
    atual?.guardianLinkId === vinculoId,
    "PERFIL",
    "A responsabilidade por este perfil mudou. Confira a proteção novamente.",
  );
  return atual;
}
