import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import { getDashboardSnapshot } from "../service";
import type { TodaySubjectsView } from "../today-subjects-service";
import { DashboardSnapshotView } from "./dashboard-snapshot-view";

type Props = {
  userId: string;
  isPro: boolean;
  profileFilter: string | null;
  profiles: Array<{ id: string; name: string }>;
  turmasForForm: TurmaWithSubjectsForForm[];
  // Lista das matérias do dia pro perfil resolvido. Null = sem perfil único
  // visível (multi-perfil sem filtro) OU sem horários cadastrados ainda.
  todaySubjects: TodaySubjectsView | null;
};

// Constrói /atividades?perfil=X preservando o filtro atual.
function buildAtividadesHref(profileFilter: string | null): string {
  return profileFilter ? `/atividades?perfil=${profileFilter}` : "/atividades";
}

export async function DashboardContent({
  userId,
  isPro,
  profileFilter,
  profiles,
  turmasForForm,
  todaySubjects,
}: Props) {
  const snapshot = await getDashboardSnapshot(userId, { profileFilter });

  return (
    <DashboardSnapshotView
      initialSnapshot={snapshot}
      userId={userId}
      isPro={isPro}
      profileFilter={profileFilter}
      profiles={profiles}
      turmasForForm={turmasForForm}
      todaySubjects={todaySubjects}
      seeAllHref={buildAtividadesHref(profileFilter)}
    />
  );
}
