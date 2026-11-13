import type { AgendaAuthority } from "@/features/family/authority";
import { getPendingSharedActivitiesForUser } from "../service";
import { SharedActivitiesWidget } from "./shared-activities-widget";

/**
 * Wrapper async-only pro widget de atividades compartilhadas pendentes.
 * Existir como componente separado permite envolver com
 * `<Suspense fallback={null}>` na page — se o user não tem nada pendente
 * (caso comum), o widget some sem layout shift; se tem, streama em
 * quando a query resolve.
 *
 * RECEBER atividade compartilhada não exige Pro: é benefício do plano
 * gratuito. Quem precisa de Pro é quem COMPARTILHA
 * (`visibility: "shared_with_turma"` no serviço de atividades). A consulta
 * continua exigindo participação na turma, então nada vaza entre turmas.
 */
export async function SharedActivitiesSection({ actor }: { actor: AgendaAuthority }) {
  const pendingShared = await getPendingSharedActivitiesForUser(actor);
  if (pendingShared.length === 0) return null;
  return <SharedActivitiesWidget items={pendingShared} />;
}
