import "server-only";
import { getProSubscription } from "@informach/billing";
import { and, db, desc, eq, inArray } from "@informach/db";
import {
  customers,
  recreioEntitlements as entitlements,
  recreioGroups as groups,
  recreioProfiles as profiles,
  subscriptions,
} from "@informach/db/schema";
import {
  type Concessao,
  type GrupoId,
  GrupoIdSchema,
  type PerfilId,
  PerfilIdSchema,
  type StatusDaAssinatura,
} from "@informach/recreio";

/**
 * Leitura dos fatos do direito de jogar. Este arquivo e o `service.ts` ao lado
 * são o único lugar do app que lê assinaturas e concessões para decidir acesso
 * (`fronteira.test.ts` confere). Aqui não há regra: só o que está no banco.
 */

const APP = "recreio";

/** Situações que não dão acesso; `getProSubscription` cobre as que dão. */
const SEM_ACESSO: StatusDaAssinatura[] = [
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "canceled",
  "paused",
];

export type AssinaturaLida = {
  id: string;
  status: StatusDaAssinatura;
  productId: string;
  /** Data em que a assinatura termina por cancelamento agendado. */
  cancelaEm: Date | null;
};

export type FatosLidos = {
  perfil: {
    id: PerfilId;
    status: "active" | "suspended";
    coberturaLigada: boolean;
    versaoDaPolitica: number;
  };
  grupo: {
    id: GrupoId;
    /** Perfis do grupo com a cobertura ligada, do mais antigo ao mais novo. */
    cobertos: PerfilId[];
    /** A assinatura que dá acesso, se houver. */
    assinaturaAtiva: AssinaturaLida | null;
    /** A assinatura mais recente que não dá acesso (atrasada, encerrada). */
    assinaturaInativa: AssinaturaLida | null;
    concessoes: Concessao[];
  } | null;
};

async function assinaturaInativaMaisRecente(donoId: string): Promise<AssinaturaLida | null> {
  const [linha] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      productId: subscriptions.productId,
      cancelaEm: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, donoId),
        eq(customers.app, APP),
        inArray(subscriptions.status, SEM_ACESSO),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd), desc(subscriptions.createdAt))
    .limit(1);
  return linha ?? null;
}

/** Tudo o que `decidirAcesso` precisa saber sobre um perfil, ou `null` se ele não existe. */
export async function lerFatosDeAcesso(perfilId: PerfilId): Promise<FatosLidos | null> {
  const [perfil] = await db
    .select({
      id: profiles.id,
      status: profiles.status,
      groupId: profiles.groupId,
      coverageEnabled: profiles.coverageEnabled,
      policyVersion: profiles.policyVersion,
    })
    .from(profiles)
    .where(eq(profiles.id, perfilId));
  if (!perfil) return null;
  const lido = {
    id: PerfilIdSchema.parse(perfil.id),
    status: perfil.status,
    coberturaLigada: perfil.coverageEnabled,
    versaoDaPolitica: perfil.policyVersion,
  };
  const [grupo] = perfil.groupId
    ? await db
        .select({ id: groups.id, ownerUserId: groups.ownerUserId })
        .from(groups)
        .where(eq(groups.id, perfil.groupId))
    : [];
  if (!grupo) return { perfil: lido, grupo: null };
  const [cobertos, ativa, inativa, concessoes] = await Promise.all([
    db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.groupId, grupo.id), eq(profiles.coverageEnabled, true)))
      .orderBy(profiles.createdAt, profiles.id),
    getProSubscription(
      { db, provider: "stripe", app: APP },
      { type: "user", id: grupo.ownerUserId },
    ),
    assinaturaInativaMaisRecente(grupo.ownerUserId),
    db
      .select({
        id: entitlements.id,
        kind: entitlements.kind,
        tier: entitlements.tier,
        inicio: entitlements.startsAt,
        fim: entitlements.endsAt,
        revogadaEm: entitlements.revokedAt,
      })
      .from(entitlements)
      .where(eq(entitlements.groupId, grupo.id)),
  ]);
  return {
    perfil: lido,
    grupo: {
      id: GrupoIdSchema.parse(grupo.id),
      cobertos: cobertos.map((linha) => PerfilIdSchema.parse(linha.id)),
      assinaturaAtiva: ativa && {
        id: ativa.id,
        status: ativa.status,
        productId: ativa.productId,
        cancelaEm: ativa.cancelAtPeriodEnd,
      },
      assinaturaInativa: inativa,
      concessoes,
    },
  };
}
