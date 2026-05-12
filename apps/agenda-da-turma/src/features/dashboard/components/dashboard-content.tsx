import { AlertCircle, CalendarDays, Clock } from "lucide-react";
import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import { getDashboardSnapshot } from "../service";
import { ActivityBucketSection } from "./activity-bucket-section";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { KpiCards } from "./kpi-cards";
import { PerProfileProgress } from "./per-profile-progress";
import { ProfileFilterTabs } from "./profile-filter-tabs";
import { UpcomingGroupedList } from "./upcoming-grouped-list";

type Props = {
  userId: string;
  isPro: boolean;
  profileFilter: string | null;
  profiles: Array<{ id: string; name: string }>;
  turmasForForm: TurmaWithSubjectsForForm[];
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
}: Props) {
  const snapshot = await getDashboardSnapshot(userId, { profileFilter });
  const { counters, overdue, today, upcoming, perProfile } = snapshot;

  const seeAllHref = buildAtividadesHref(profileFilter);
  const isEmpty =
    counters.overdue === 0 &&
    counters.today === 0 &&
    counters.week === 0 &&
    counters.doneRecent === 0;
  const filteredProfileName = profileFilter
    ? profiles.find((p) => p.id === profileFilter)?.name
    : undefined;

  return (
    <div className="space-y-6">
      <ProfileFilterTabs profiles={profiles} active={profileFilter} />

      <KpiCards counters={counters} />

      {perProfile.length >= 2 && profileFilter == null ? (
        <PerProfileProgress profiles={perProfile} />
      ) : null}

      {isEmpty ? (
        <DashboardEmptyState
          scope={profileFilter ? "filtered" : "all"}
          profileName={filteredProfileName}
        />
      ) : (
        <>
          <ActivityBucketSection
            title="Atrasadas"
            Icon={AlertCircle}
            tone="destructive"
            items={overdue}
            totalCount={counters.overdue}
            currentUserId={userId}
            isPro={isPro}
            turmasForForm={turmasForForm}
            seeAllHref={seeAllHref}
          />
          <ActivityBucketSection
            title="Hoje"
            Icon={Clock}
            tone="chart-4"
            items={today}
            totalCount={counters.today}
            currentUserId={userId}
            isPro={isPro}
            turmasForForm={turmasForForm}
            seeAllHref={seeAllHref}
          />
          <ActivityBucketSection
            title="Próximos 7 dias"
            Icon={CalendarDays}
            tone="primary"
            items={upcoming}
            totalCount={counters.week}
            currentUserId={userId}
            isPro={isPro}
            turmasForForm={turmasForForm}
            seeAllHref={seeAllHref}
            renderItems={(items) => (
              <UpcomingGroupedList
                items={items}
                currentUserId={userId}
                isPro={isPro}
                turmasForForm={turmasForForm}
              />
            )}
          />
        </>
      )}
    </div>
  );
}
