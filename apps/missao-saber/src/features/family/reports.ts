import "server-only";
import { cache } from "react";
import { homeSupportFor } from "@/features/content/apoio-em-casa";
import { resolvedCourse, skillNames } from "@/features/content/catalog";
import { laboratoryReport } from "@/features/labs/runtime/family-report";
import { repeatedDifficulties, skillStates, weeklyEvidence } from "@/features/learning/engine";
import { weeklyNarrative } from "@/features/learning/relato";
import { history } from "@/features/learning/repository";
import { requirePageUser } from "@/lib/auth";
import { latestFamilyActivity } from "./activity";
import { familyDashboard } from "./view";

// Shared by overview and detail: the existing evidence rules remain authoritative.
export const familyLearningReports = cache(async () => {
  const user = await requirePageUser();
  const data = await familyDashboard();
  return Promise.all(
    data.profiles.map(async (profile) => {
      const [{ evidence, reflections, recent }, laboratory] = await Promise.all([
        history(user.id, profile.id),
        laboratoryReport(user.id, profile.id),
      ]);
      const states = skillStates(evidence);
      const course = resolvedCourse(profile);
      const nextSkill = course?.skills.find(
        (id) => states.find((state) => state.skillId === id)?.level !== "independent",
      );
      const now = new Date();
      const weekly = weeklyEvidence(evidence, now);
      const difficulties = repeatedDifficulties(evidence, now);
      const last = [...evidence].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        profile,
        course,
        evidence,
        reflections,
        recent,
        laboratory,
        states,
        weekly,
        nextSkill,
        last,
        activity: latestFamilyActivity({ evidence, reflections, laboratory }, skillNames),
        difficulties,
        notStudied:
          course?.skills.filter((id) => !states.some((state) => state.skillId === id)) ?? [],
        support: homeSupportFor(nextSkill ?? difficulties[0]?.skillId ?? ""),
        narrative: weeklyNarrative({
          nickname: profile.nickname,
          evidence,
          weekly,
          states,
          repeatedDifficulties: difficulties,
          nextSkillId: nextSkill,
          reflections: reflections.length,
          now,
          skillNames,
        }),
      };
    }),
  );
});
export type FamilyLearningReport = Awaited<ReturnType<typeof familyLearningReports>>[number];
