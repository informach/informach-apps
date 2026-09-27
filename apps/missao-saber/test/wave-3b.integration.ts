import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { missaoProfiles, users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { coursesForGrade } from "@/features/content/catalog";
import { schoolYear } from "@/features/family/school-year";
import { begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Responsável da 3ª série",
    emailVerified: true,
  });
});

describe("onda 3b em PostgreSQL isolado: Canguru S", () => {
  it("oferece a Canguru S na 3ª série e leva a Canguru J para ela na virada", async () => {
    expect(coursesForGrade(12).map((course) => course.id)).toEqual(
      expect.arrayContaining(["canguru-s", "obmep-n3"]),
    );
    expect(coursesForGrade(12).map((course) => course.id)).not.toContain("canguru-j");
    const profile = await createProfile(owner, {
      nickname: "Iara",
      grade: 11,
      birthMonth: null,
      avatar: "estrela",
      courseId: "canguru-j",
      consent: true,
    });
    // 2ª série na Canguru J, gravada no ano passado: a trilha da mesma olimpíada na 3ª série é a S.
    await db
      .update(missaoProfiles)
      .set({ gradeYear: schoolYear() - 1 })
      .where(eq(missaoProfiles.id, profile.id));
    const painel = await dashboard(owner, profile.id);
    expect(painel.profile?.grade).toBe(12);
    expect(painel.courseTransition?.to?.id).toBe("canguru-s");
    const sessao = await begin(owner, {
      profileId: profile.id,
      lessonId: "equacoes-em-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("equacoes-em-1");
    const [depois] = await db
      .select()
      .from(missaoProfiles)
      .where(eq(missaoProfiles.id, profile.id));
    expect(depois?.courseId).toBe("canguru-s");
  });
});
