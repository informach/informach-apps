import { getTurmasWithSubjectsForForm } from "@/features/activities/service";
import { getTodaySubjectsForProfile } from "../today-subjects-service";
import { DashboardContent } from "./dashboard-content";

type Props = {
  userId: string;
  isPro: boolean;
  profileFilter: string | null;
  profiles: Array<{ id: string; name: string }>;
  effectiveProfileId: string | null;
};

/**
 * Wrapper async pro `<DashboardContent>` — busca em paralelo as queries
 * exclusivas da view real do dashboard (`turmasForForm` + `todaySubjects`).
 * Existir como componente separado permite envolver com `<Suspense>` na page
 * sem inflar a página principal; streaming RSC do Next 16 envia o shell
 * (header + DashboardNavButtons) imediatamente e o skeleton até resolver.
 *
 * O snapshot de KPIs/buckets é awaited dentro do `<DashboardContent>` (também
 * fica sob este Suspense) — uma única queda de "ready" pra todas as seções
 * de baixo, evita N skeletons piscando juntos.
 */
export async function DashboardSection({
  userId,
  isPro,
  profileFilter,
  profiles,
  effectiveProfileId,
}: Props) {
  const [turmasForForm, todaySubjects] = await Promise.all([
    getTurmasWithSubjectsForForm(userId),
    effectiveProfileId
      ? getTodaySubjectsForProfile(userId, effectiveProfileId)
      : Promise.resolve(null),
  ]);

  return (
    <DashboardContent
      userId={userId}
      isPro={isPro}
      profileFilter={profileFilter}
      profiles={profiles}
      turmasForForm={turmasForForm}
      todaySubjects={todaySubjects}
    />
  );
}
