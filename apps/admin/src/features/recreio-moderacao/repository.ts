import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "@informach/db";
import {
  recreioFriendships,
  recreioProfileRestrictions,
  recreioProfiles,
  recreioRestrictionReviews,
  recreioSafetyReports,
} from "@informach/db/schema";
import { readDb } from "@/lib/read-db";

const TAMANHO = 20;
/** Projeção restrita: referências e classificadores, nunca nomes, nascimento ou conteúdo de mundo. */
export async function lerFilaDeSeguranca(protocolo?: string) {
  const [denuncias, recursos] = await Promise.all([
    readDb()
      .select({
        protocolo: recreioSafetyReports.id,
        perfilAlvoId: recreioSafetyReports.targetProfileId,
        categoria: recreioSafetyReports.category,
        prioridade: recreioSafetyReports.priority,
        situacao: recreioSafetyReports.state,
        revisao: recreioSafetyReports.revision,
        evidencia: recreioSafetyReports.evidenceKind,
        revisaoDaAmizade: recreioSafetyReports.evidenceRevision,
        amizadeAtual: recreioFriendships.state,
        revisaoAtualDaAmizade: recreioFriendships.revision,
        decisao: recreioSafetyReports.decision,
        criadoEm: recreioSafetyReports.createdAt,
        recursoEm: recreioSafetyReports.reviewRequestedAt,
        estadoDoPerfil: recreioProfiles.status,
        versaoDoPerfil: recreioProfiles.policyVersion,
      })
      .from(recreioSafetyReports)
      .leftJoin(recreioProfiles, eq(recreioProfiles.id, recreioSafetyReports.targetProfileId))
      .leftJoin(
        recreioFriendships,
        and(
          eq(
            recreioFriendships.lowerProfileId,
            sql`least(${recreioSafetyReports.reporterProfileId},${recreioSafetyReports.targetProfileId})`,
          ),
          eq(
            recreioFriendships.higherProfileId,
            sql`greatest(${recreioSafetyReports.reporterProfileId},${recreioSafetyReports.targetProfileId})`,
          ),
        ),
      )
      .where(
        and(
          gt(recreioSafetyReports.expiresAt, sql`clock_timestamp()`),
          protocolo
            ? eq(recreioSafetyReports.id, protocolo)
            : inArray(recreioSafetyReports.state, ["aberta", "em_analise", "recurso"]),
        ),
      )
      .orderBy(
        desc(recreioSafetyReports.priority),
        asc(recreioSafetyReports.createdAt),
        asc(recreioSafetyReports.id),
      )
      .limit(TAMANHO + 1),
    readDb()
      .select({
        protocolo: recreioRestrictionReviews.id,
        perfilId: recreioRestrictionReviews.profileId,
        situacao: recreioRestrictionReviews.state,
        revisao: recreioRestrictionReviews.revision,
        versaoDaRestricao: recreioRestrictionReviews.restrictionRevision,
        decisao: recreioRestrictionReviews.decision,
        criadoEm: recreioRestrictionReviews.createdAt,
        estadoDoPerfil: recreioProfiles.status,
        versaoDoPerfil: recreioProfiles.policyVersion,
        restricaoAtual: recreioProfileRestrictions.revision,
        motivoDaRestricao: recreioProfileRestrictions.reason,
      })
      .from(recreioRestrictionReviews)
      .innerJoin(recreioProfiles, eq(recreioProfiles.id, recreioRestrictionReviews.profileId))
      .leftJoin(
        recreioProfileRestrictions,
        eq(recreioProfileRestrictions.profileId, recreioRestrictionReviews.profileId),
      )
      .where(
        and(
          gt(recreioRestrictionReviews.expiresAt, sql`clock_timestamp()`),
          protocolo
            ? eq(recreioRestrictionReviews.id, protocolo)
            : eq(recreioRestrictionReviews.state, "aberto"),
        ),
      )
      .orderBy(asc(recreioRestrictionReviews.createdAt), asc(recreioRestrictionReviews.id))
      .limit(TAMANHO + 1),
  ]);
  return {
    denuncias: denuncias.slice(0, TAMANHO),
    recursos: recursos.slice(0, TAMANHO),
    maisDenuncias: denuncias.length > TAMANHO,
    maisRecursos: recursos.length > TAMANHO,
  };
}
