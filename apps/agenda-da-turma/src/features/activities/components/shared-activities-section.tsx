import { getPendingSharedActivitiesForUser } from "../service";
import { SharedActivitiesWidget } from "./shared-activities-widget";

/**
 * Wrapper async-only pro widget de atividades compartilhadas pendentes
 * (Pro-only). Existir como componente separado permite envolver com
 * `<Suspense fallback={null}>` na page — se o user não tem nada pendente
 * (caso comum), o widget some sem layout shift; se tem, streama em
 * quando a query resolve.
 *
 * Caller (page.tsx) só renderiza este componente quando o user é Pro.
 */
export async function SharedActivitiesSection({ userId }: { userId: string }) {
  const pendingShared = await getPendingSharedActivitiesForUser(userId);
  if (pendingShared.length === 0) return null;
  return <SharedActivitiesWidget items={pendingShared} />;
}
