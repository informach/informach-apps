import "server-only";

import { and, count, db, eq, sql } from "@informach/db";
import { agendaNotices, agendaProductEvents } from "@informach/db/schema";
import { cache } from "react";
import { getIsProForUser } from "@/features/billing/server-cache";
import { findAccessibleProfile, listAccessibleProfiles } from "@/features/family/access";
import { billing } from "@/lib/billing";
import type { AddEntitlement } from "./entitlement";
import { FREE_NOTICE_TRIAL, isNoticeUserVerified } from "./parse-repository";

/**
 * Franquia de teste do plano gratuito, compartilhada por todo o fluxo de
 * entrada (leitura de recado e transcrição de ditado).
 *
 * A franquia é contada em **importações**, não em créditos: o teto de
 * `FREE_NOTICE_TRIAL` é aplicado em `reserveNoticeParse`, sobre linhas de
 * `agenda.notices` com `is_trial`. Os créditos concedidos aqui só financiam
 * essas importações — e por isso precisam sobrar, nunca faltar. Se o saldo
 * acabar antes do teto, a pessoa vê uma falha enquanto a tela ainda anuncia
 * importações restantes.
 *
 * São duas concessões idempotentes por `stripeEventId`:
 *
 * - `base` financia a leitura do recado: 1 crédito por importação.
 * - `voice` financia a transcrição, concedida na primeira vez que a pessoa
 *   dita. Ditar é iterativo — regravar porque a frase saiu errada é normal —
 *   então financia `TRIAL_VOICE_CALLS_PER_IMPORT` transcrições por importação.
 *
 * Financiar generosamente não basta: nada impede a transcrição de comer todo o
 * saldo antes do teto de importações, e aí a tela anuncia importações que
 * falham por falta de crédito. Quem garante a promessa é a reserva abaixo:
 * a transcrição é recusada quando gastá-la deixaria menos de um crédito por
 * importação ainda disponível. O ditado acaba antes; a importação por texto ou
 * foto continua valendo até a quinta.
 *
 * Separar as concessões (em vez de uma só, maior) mantém a idempotência para
 * quem já recebeu a franquia antiga, sem conceder duas vezes.
 */
const TRIAL_GRANT_KEYS = {
  base: "agenda-notice-trial-v1",
  voice: "agenda-notice-trial-voice-v1",
} as const;

export type NoticeTrialGrant = keyof typeof TRIAL_GRANT_KEYS;

const TRIAL_VOICE_CALLS_PER_IMPORT = 3;

const TRIAL_GRANT_AMOUNTS: Record<NoticeTrialGrant, number> = {
  base: FREE_NOTICE_TRIAL,
  voice: FREE_NOTICE_TRIAL * TRIAL_VOICE_CALLS_PER_IMPORT,
};

/** Importações de teste já consumidas pela conta titular. */
export async function countTrialImports(ownerId: string): Promise<number> {
  const [used] = await db
    .select({ value: count() })
    .from(agendaNotices)
    .where(
      and(
        eq(agendaNotices.ownerUserId, ownerId),
        eq(agendaNotices.isTrial, true),
        sql`${agendaNotices.status} IN ('ready', 'confirmed', 'processing')`,
      ),
    );
  return used?.value ?? 0;
}

export async function hasTrialImportsLeft(ownerId: string): Promise<boolean> {
  return (await countTrialImports(ownerId)) < FREE_NOTICE_TRIAL;
}

/** Idempotente por `stripeEventId` — chamar de novo não concede outra vez. */
export async function grantNoticeTrialCredits(
  ownerId: string,
  grant: NoticeTrialGrant,
): Promise<void> {
  await billing.grantBonusCredits({
    owner: { type: "user", id: ownerId },
    amount: TRIAL_GRANT_AMOUNTS[grant],
    reason: "promo",
    stripeEventId: `${TRIAL_GRANT_KEYS[grant]}:${ownerId}`,
  });
}

export type TrialAdmission =
  | { ok: true }
  | { ok: false; code: "VERIFY_EMAIL" | "TRIAL_BUSY" | "TRIAL_ENDED" | "VOICE_TRIAL_SPENT" };

/**
 * Mesmas pré-condições que `reserveNoticeParse` aplica ao plano gratuito,
 * disponíveis para as rotas que entram pela franquia antes de existir um
 * recado (hoje, a transcrição do ditado).
 *
 * Sem isto, uma conta com e-mail não confirmado gastava chamadas reais de IA
 * por conta da casa, sem teto diário global — bastava não confirmar o e-mail.
 * O orçamento diário é apenas consultado aqui: quem o consome é a importação,
 * que registra `trial_started`.
 */
export async function checkTrialAdmission(
  userId: string,
  ownerId: string,
  dailyBudget: number,
  grant: NoticeTrialGrant,
): Promise<TrialAdmission> {
  if (!(await isNoticeUserVerified(userId))) return { ok: false, code: "VERIFY_EMAIL" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [budget] = await db
    .select({ value: count() })
    .from(agendaProductEvents)
    .where(
      and(
        eq(agendaProductEvents.event, "trial_started"),
        sql`${agendaProductEvents.createdAt} >= ${since.toISOString()}::timestamptz`,
      ),
    );
  if ((budget?.value ?? 0) >= dailyBudget) return { ok: false, code: "TRIAL_BUSY" };

  const used = await countTrialImports(ownerId);
  const importsLeft = FREE_NOTICE_TRIAL - used;
  if (importsLeft <= 0) return { ok: false, code: "TRIAL_ENDED" };

  if (grant === "voice") {
    // Um crédito por importação restante fica reservado para a leitura do
    // recado. Ditar só entra no que sobra.
    const { available } = await billing.getBalance({ type: "user", id: ownerId });
    if (available - 1 < importsLeft) return { ok: false, code: "VOICE_TRIAL_SPENT" };
  }
  return { ok: true };
}

/**
 * Conta titular da franquia. Um segundo adulto convidado usa o plano e os
 * créditos da família, nunca os próprios — sem isto ele aparece como Free numa
 * família Pro, e a tela anuncia uma franquia que não é dele.
 */
export async function resolveTrialOwner(
  userId: string,
  profileId?: string | null,
): Promise<string> {
  if (profileId) {
    const profile = await findAccessibleProfile(userId, profileId);
    if (profile) return profile.userId;
  }
  const profiles = await listAccessibleProfiles(userId);
  // A própria conta primeiro. `listAccessibleProfiles` não tem ORDER BY, então
  // pegar `profiles[0]` faria um adulto que é titular E convidado de outra
  // família ver ora a franquia dele, ora a da outra casa, alternando entre
  // renderizações. O desempate por id mantém estável o caso do convidado puro.
  if (profiles.some((p) => p.userId === userId)) return userId;
  return [...profiles].sort((a, b) => a.userId.localeCompare(b.userId))[0]?.userId ?? userId;
}

/**
 * O que a folha Adicionar precisa mostrar: plano e franquia **do titular**.
 *
 * `cache` por request porque a folha aparece no rodapé de toda página
 * autenticada além das telas que já a montam — sem isso seriam três consultas
 * extras por navegação.
 *
 * Não recebe criança: numa família o titular é o mesmo para todos os filhos, e
 * é dele que sai o plano. Só divergiria para alguém com acesso a crianças de
 * dois titulares diferentes, o que o produto não oferece hoje.
 */
export const getAddEntitlement = cache(async (userId: string): Promise<AddEntitlement> => {
  const ownerId = await resolveTrialOwner(userId);
  const [isPro, used] = await Promise.all([
    // Wrapper cacheado por request: deduplica com a consulta que as páginas já
    // fazem para o mesmo titular.
    getIsProForUser(ownerId),
    countTrialImports(ownerId),
  ]);
  return { isPro, trialLeft: Math.max(0, FREE_NOTICE_TRIAL - used) };
});

export type { AddEntitlement };
export { FREE_NOTICE_TRIAL };
