import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioDeviceSessions as deviceSessions,
  recreioGroups as groups,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import {
  type ContaId,
  type GrupoId,
  GrupoIdSchema,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
} from "@informach/recreio";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import type { EdicaoDoPerfil, NovoPerfil } from "./regras";

/** O perfil como o portal o conhece. Não leva a conta: o jogo só vê o `id`. */
export type PerfilDoRecreio = {
  id: PerfilId;
  grupoId: GrupoId | null;
  tipo: "adult" | "minor";
  apelido: string;
  avatar: string;
  status: "active" | "suspended";
  versaoDaPolitica: number;
};

const campos = {
  id: profiles.id,
  groupId: profiles.groupId,
  kind: profiles.kind,
  nickname: profiles.nickname,
  avatar: profiles.avatar,
  status: profiles.status,
  policyVersion: profiles.policyVersion,
};
type Linha = {
  id: string;
  groupId: string | null;
  kind: "adult" | "minor";
  nickname: string;
  avatar: string;
  status: "active" | "suspended";
  policyVersion: number;
};

function paraPerfil(linha: Linha): PerfilDoRecreio {
  return {
    id: PerfilIdSchema.parse(linha.id),
    grupoId: linha.groupId === null ? null : GrupoIdSchema.parse(linha.groupId),
    tipo: linha.kind,
    apelido: linha.nickname,
    avatar: linha.avatar,
    status: linha.status,
    versaoDaPolitica: linha.policyVersion,
  };
}

/** O perfil de login próprio da conta: no máximo um. */
export async function perfisDaConta(contaId: ContaId): Promise<PerfilDoRecreio[]> {
  const linhas = await db
    .select(campos)
    .from(profiles)
    .where(eq(profiles.userId, contaId))
    .orderBy(profiles.createdAt, profiles.id);
  return linhas.map(paraPerfil);
}

/** Perfil → aparelho; os dois permanecem travados até dados e auditoria confirmarem. */
export async function editarPerfilDaConta(
  ator: { contaId: ContaId; sessaoDeAparelhoId: SessaoDeAparelhoId },
  dados: EdicaoDoPerfil,
): Promise<PerfilDoRecreio> {
  return db.transaction(async (tx) => {
    const [perfil] = await tx
      .select(campos)
      .from(profiles)
      .where(and(eq(profiles.userId, ator.contaId), eq(profiles.kind, "adult")))
      .for("update");
    assertAllowed(perfil?.status === "active", "PERFIL", "Perfil não disponível.");
    const [aparelho] = await tx
      .select({
        id: deviceSessions.id,
        activeProfileId: deviceSessions.activeProfileId,
        revokedAt: deviceSessions.revokedAt,
      })
      .from(deviceSessions)
      .where(
        and(
          eq(deviceSessions.id, ator.sessaoDeAparelhoId),
          eq(deviceSessions.userId, ator.contaId),
          eq(deviceSessions.kind, "account"),
        ),
      )
      .for("share");
    assertAllowed(
      aparelho && aparelho.activeProfileId === perfil.id && aparelho.revokedAt === null,
      "AUTH",
      "Entre novamente para continuar.",
    );
    // O relógio é consultado depois de adquirir as travas, inclusive após esperar.
    const [prazo] = await tx
      .select({ valido: sql<boolean>`${deviceSessions.expiresAt} > ${AGORA}` })
      .from(deviceSessions)
      .where(eq(deviceSessions.id, aparelho.id));
    assertAllowed(prazo?.valido, "AUTH", "Entre novamente para continuar.");
    const fields: ("nickname" | "avatar")[] = [];
    if (perfil.nickname !== dados.novo.apelido) fields.push("nickname");
    if (perfil.avatar !== dados.novo.avatar) fields.push("avatar");
    if (fields.length === 0) return paraPerfil(perfil);
    assertAllowed(
      perfil.nickname === dados.anterior.apelido && perfil.avatar === dados.anterior.avatar,
      "CONFLITO",
      "O perfil mudou em outra tela. Volte à conta e abra a edição novamente.",
    );
    const [atualizado] = await tx
      .update(profiles)
      .set({ nickname: dados.novo.apelido, avatar: dados.novo.avatar, updatedAt: sql`now()` })
      .where(and(eq(profiles.id, perfil.id), eq(profiles.userId, ator.contaId)))
      .returning(campos);
    assertAllowed(atualizado, "PERFIL", "Perfil não disponível.");
    await logAuditEventStrict(
      "recreio.profile_updated",
      ator.contaId,
      { app: "recreio", profileId: perfil.id, fields },
      { writer: tx },
    );
    return paraPerfil(atualizado);
  });
}

/**
 * Cria o perfil adulto da conta e o grupo dela, numa transação só. A conta
 * fica travada do começo ao fim: dois pedidos ao mesmo tempo dão um perfil e
 * um grupo, e o segundo recebe o perfil que o primeiro criou (`criado: false`).
 * Um grupo que a equipe já criou ao conceder acesso é reaproveitado.
 */
export async function criarPerfilDaConta(
  contaId: ContaId,
  dados: NovoPerfil,
): Promise<{ perfil: PerfilDoRecreio; criado: boolean }> {
  return db.transaction(async (tx) => {
    const [conta] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, contaId))
      .for("no key update");
    assertAllowed(conta, "AUTH", "Entre novamente para continuar.");
    const [existente] = await tx.select(campos).from(profiles).where(eq(profiles.userId, contaId));
    if (existente) return { perfil: paraPerfil(existente), criado: false };
    await tx
      .insert(groups)
      .values({ ownerUserId: contaId })
      .onConflictDoNothing({ target: groups.ownerUserId });
    const [grupo] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, contaId));
    assertAllowed(grupo, "PERFIL", "Não foi possível criar o perfil. Tente de novo.");
    const [criado] = await tx
      .insert(profiles)
      .values({
        userId: contaId,
        groupId: grupo.id,
        kind: "adult",
        nickname: dados.apelido,
        avatar: dados.avatar,
      })
      .returning(campos);
    assertAllowed(criado, "PERFIL", "Não foi possível criar o perfil. Tente de novo.");
    await logAuditEventStrict(
      "recreio.profile_created",
      contaId,
      { app: "recreio", profileId: criado.id, kind: criado.kind },
      { writer: tx },
    );
    return { perfil: paraPerfil(criado), criado: true };
  });
}
