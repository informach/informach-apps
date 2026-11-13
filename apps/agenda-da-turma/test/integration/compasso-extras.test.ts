import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { agendaTasks } from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { listProfileSubjectActivitiesForSubject } from "@/features/profile-subject-activities/repository";
import {
  createProfileSubjectActivity,
  deleteProfileSubjectActivity,
  setProfileSubjectActivityStatusForUser,
  updateProfileSubjectActivity,
} from "@/features/profile-subject-activities/service";
import { listActiveProfileSubjectsForProfiles } from "@/features/profile-subjects/repository";
import {
  createProfileSubject,
  setProfileSubjectStatusForUser,
  updateProfileSubject,
} from "@/features/profile-subjects/service";

import { family, agendaFixture as fixture, value } from "./compasso-fixture";

const content = {
  type: "task" as const,
  title: "Practice",
  description: "Private exercise",
  dueAt: "2026-11-12",
};
describe("Compasso extracurricular authority and atomic limits", () => {
  it("separates read, write and context on both subjects and tasks", async () => {
    const f = await fixture();
    const subject = value(
      await createProfileSubject(f.actor, {
        profileId: f.profile.id,
        name: "Music",
        classDays: ["mon"],
      }),
    );
    const task = value(
      await createProfileSubjectActivity(f.actor, { ...content, profileSubjectId: subject.id }),
    );
    expect(await listActiveProfileSubjectsForProfiles(f.visitor, [f.profile.id])).toEqual([]);
    expect(await listProfileSubjectActivitiesForSubject(f.visitor, subject.id)).toEqual([]);
    await family.grantAccess(f.owner, { ...f.target, action: "read" });
    expect(await listActiveProfileSubjectsForProfiles(f.visitor, [f.profile.id])).toHaveLength(1);
    expect(await listProfileSubjectActivitiesForSubject(f.visitor, subject.id)).toHaveLength(1);
    expect(
      await updateProfileSubject(f.visitor, { id: subject.id, name: "Changed", classDays: [] }),
    ).toMatchObject({ ok: false });
    expect(
      await setProfileSubjectActivityStatusForUser(f.visitor, {
        id: task.id,
        version: task.version,
        status: "done",
      }),
    ).toMatchObject({ ok: false });
    await family.grantAccess(f.owner, { ...f.target, action: "write" });
    expect(
      await updateProfileSubject(f.visitor, { id: subject.id, name: "Violin", classDays: ["tue"] }),
    ).toMatchObject({ ok: true });
    expect(
      await setProfileSubjectActivityStatusForUser(f.visitor, {
        id: task.id,
        version: task.version,
        status: "done",
      }),
    ).toMatchObject({ ok: true });
    const other = await family.createGroup(f.owner, "Other");
    expect(
      await listProfileSubjectActivitiesForSubject(
        { ...f.actor, familyGroupId: other.id },
        subject.id,
      ),
    ).toEqual([]);
  });
  it("serializes the free subject capacity across adults", async () => {
    const f = await fixture();
    for (const action of ["read", "write"] as const)
      await family.grantAccess(f.owner, { ...f.target, action });
    const results = await Promise.all(
      [f.actor, f.visitor].map((actor, index) =>
        createProfileSubject(actor, {
          profileId: f.profile.id,
          name: `Extra ${index}`,
          classDays: [],
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      error: { code: "PLAN_LIMIT_REACHED", current: 1, limit: 1 },
    });
  });
  it("serializes the shared pending limit and rejects tasks for a paused subject", async () => {
    const f = await fixture();
    const subject = value(
      await createProfileSubject(f.actor, {
        profileId: f.profile.id,
        name: "Music",
        classDays: [],
      }),
    );
    await db.insert(agendaTasks).values(
      Array.from({ length: 19 }, (_, i) => ({
        profileId: f.profile.id,
        createdByUserId: f.owner,
        type: "task" as const,
        title: `Existing ${i}`,
        fingerprint: randomUUID(),
      })),
    );
    const results = await Promise.all(
      ["First", "Second"].map((title) =>
        createProfileSubjectActivity(f.actor, { ...content, title, profileSubjectId: subject.id }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      error: { code: "ACTIVITY_LIMIT_REACHED", current: 20 },
    });
    expect(
      await setProfileSubjectStatusForUser(f.actor, { id: subject.id, status: "paused" }),
    ).toMatchObject({ ok: true });
    expect(
      await createProfileSubjectActivity(f.actor, { ...content, profileSubjectId: subject.id }),
    ).toMatchObject({ ok: false, error: { code: "PROFILE_SUBJECT_NOT_FOUND" } });
  });
  it("preserves a concurrent completion instead of overwriting or deleting stale content", async () => {
    const f = await fixture();
    const subject = value(
      await createProfileSubject(f.actor, {
        profileId: f.profile.id,
        name: "Music",
        classDays: [],
      }),
    );
    const task = value(
      await createProfileSubjectActivity(f.actor, { ...content, profileSubjectId: subject.id }),
    );
    expect(
      await setProfileSubjectActivityStatusForUser(f.actor, {
        id: task.id,
        version: task.version,
        status: "done",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await updateProfileSubjectActivity(f.actor, {
        ...content,
        id: task.id,
        version: task.version,
        title: "Old edit",
      }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(
      await deleteProfileSubjectActivity(f.actor, { id: task.id, version: task.version }),
    ).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const [current] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, task.id));
    expect(current).toMatchObject({ status: "done", title: "Practice", version: task.version + 1 });
  });
});
