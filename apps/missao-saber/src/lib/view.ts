import "server-only";
import { cache } from "react";
import { dashboard } from "@/features/learning/service";
import { requireStudyPage } from "@/features/study-access/server";

export const currentDashboard = cache(async () => {
  const identity = await requireStudyPage();
  const data = await dashboard(identity.userId, identity.profileId);
  return {
    ...data,
    userId: identity.userId,
    profiles: data.profiles.filter((profile) => identity.profileIds.includes(profile.id)),
  };
});
