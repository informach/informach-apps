import "server-only";
import { cache } from "react";
import type { AgendaAuthority } from "@/features/family/authority";
import { getTomorrowSubjectsForProfiles } from "./today-subjects-service";

const load = cache((userId: string, familyGroupId: string, profileFilter: string | null) =>
  getTomorrowSubjectsForProfiles({ userId, familyGroupId }, { profileFilter }),
);
export function getTomorrowSubjectsCached(actor: AgendaAuthority, profileFilter: string | null) {
  return load(actor.userId, actor.familyGroupId, profileFilter);
}
