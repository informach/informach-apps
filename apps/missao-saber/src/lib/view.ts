import "server-only";
import { cache } from "react";
import { getProfiles } from "@/features/learning/repository";
import { dashboard } from "@/features/learning/service";
import { requireStudyPage } from "@/features/study-access/server";

export const currentDashboard = cache(async () => {
  const identity = await requireStudyPage();
  const data = await dashboard(identity, identity.profileId);
  return {
    ...data,
    userId: identity.userId,
    authority: identity,
    profiles: (
      await Promise.all(
        identity.profileIds.map((profileId) => getProfiles({ ...identity, profileId })),
      )
    ).flat(),
  };
});
