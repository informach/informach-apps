import { expect, it } from "vitest";
import { activationOverview } from "@/features/family/context-repository";
import {
  dismissFirstSteps,
  isFirstStepsDismissed,
  listTurmasNeedingScheduleForUser,
} from "@/features/onboarding/first-steps-repository";
import { agendaFixture, classroomFixture, family } from "./compasso-fixture";

it("keeps onboarding dismissal per adult and household and refuses revoked memberships", async () => {
  const f = await agendaFixture();
  const group = await family.createGroup(f.owner, "Other home");
  const other = { ...f.actor, familyGroupId: group.id };
  await dismissFirstSteps(f.actor);
  expect(await isFirstStepsDismissed(f.actor)).toBe(true);
  expect(await isFirstStepsDismissed(f.visitor)).toBe(false);
  expect(await isFirstStepsDismissed(other)).toBe(false);
  await dismissFirstSteps(other);
  await dismissFirstSteps(f.visitor);
  expect(await isFirstStepsDismissed(other)).toBe(true);
  await family.revokeMember(f.owner, f.actor.familyGroupId, f.visitor.userId);
  expect(await isFirstStepsDismissed(f.visitor)).toBe(false);
  await expect(dismissFirstSteps(f.visitor)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("shows activation and school setup only within current role and child permissions", async () => {
  const f = await agendaFixture(true);
  const c = await classroomFixture(f);
  expect(await activationOverview(f.actor)).toEqual({
    canActivate: true,
    currentCount: 1,
    limit: 4,
  });
  expect(await activationOverview(f.visitor)).toEqual({
    canActivate: false,
    currentCount: 0,
    limit: 4,
  });
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  expect(await listTurmasNeedingScheduleForUser(f.visitor)).toEqual([]);
  await family.grantAccess(f.owner, { ...f.target, action: "write" });
  expect(await listTurmasNeedingScheduleForUser(f.visitor)).toEqual([{ turmaId: c.turma.id }]);
});
