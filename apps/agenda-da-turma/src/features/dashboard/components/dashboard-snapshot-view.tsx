"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityStatusValue, TurmaWithSubjectsForForm } from "@/features/activities/types";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { applyDashboardStatusSuccess } from "../optimistic";
import type { TodaySubjectsView } from "../today-subjects-service";
import type { DashboardBucket, DashboardSnapshot } from "../types";
import { ActivityBucketSection } from "./activity-bucket-section";
import { DashboardEmptyState } from "./dashboard-empty-state";
import { KpiCards } from "./kpi-cards";
import { PerProfileProgress } from "./per-profile-progress";
import { ProfileFilterTabs } from "./profile-filter-tabs";
import { TodaySubjectsCard } from "./today-subjects-card";

type Props = {
  initialSnapshot: DashboardSnapshot;
  userId: string;
  isPro: boolean;
  profileFilter: string | null;
  profiles: Array<{ id: string; name: string }>;
  turmasForForm: TurmaWithSubjectsForForm[];
  todaySubjects: TodaySubjectsView | null;
  seeAllHref: string;
};

const BUCKET_ITEMS: Record<
  DashboardBucket,
  keyof Pick<DashboardSnapshot, "overdue" | "today" | "upcoming">
> = {
  overdue: "overdue",
  today: "today",
  week: "upcoming",
};

export function DashboardSnapshotView({
  initialSnapshot,
  userId,
  isPro,
  profileFilter,
  profiles,
  turmasForForm,
  todaySubjects,
  seeAllHref,
}: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  const handleItemStatusSuccess = useCallback(
    (
      item: UnifiedActivityListItem,
      previousStatus: ActivityStatusValue,
      nextStatus: ActivityStatusValue,
    ) => {
      setSnapshot((current) =>
        applyDashboardStatusSuccess(current, item, previousStatus, nextStatus),
      );
    },
    [],
  );

  const { counters, perProfile } = snapshot;
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

      {todaySubjects ? <TodaySubjectsCard view={todaySubjects} /> : null}

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
        (["overdue", "today", "week"] as const).map((bucket) => (
          <ActivityBucketSection
            key={bucket}
            bucket={bucket}
            items={snapshot[BUCKET_ITEMS[bucket]]}
            totalCount={counters[bucket]}
            currentUserId={userId}
            isPro={isPro}
            turmasForForm={turmasForForm}
            seeAllHref={seeAllHref}
            onItemStatusSuccess={handleItemStatusSuccess}
          />
        ))
      )}
    </div>
  );
}
