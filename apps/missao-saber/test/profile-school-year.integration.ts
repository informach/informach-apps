import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { missaoProfiles, users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { schoolYear } from "@/features/family/school-year";
import { getProfiles } from "@/features/learning/repository";
import { begin, createProfile, dashboard, updateProfile } from "@/features/learning/service";

const owner = randomUUID();
const stranger = randomUUID();
let profileId = "";

beforeAll(async () => {
  await db.insert(users).values([
    { id: owner, email: `a-${owner}@example.test`, name: "Responsável A", emailVerified: true },
    { id: stranger, email: `b-${stranger}@example.test`, name: "Responsável B", emailVerified: true },
  ]);
  profileId = (
    await createProfile(owner, {
      nickname: "Sol",
      grade: 6,
      birthMonth: `${schoolYear() - 12}-06`,
      avatar: "cometa",
      courseId: "canguru-e",
      consent: true,
    })
  ).id;
});

describe("ano escolar do perfil em PostgreSQL isolado", () => {
  it("grava o ano civil e só o mês de nascimento", async () => {
    const [row] = await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profileId));
    expect(row?.gradeYear).toBe(schoolYear());
    expect(String(row?.birthMonth)).toMatch(new RegExp(`^${schoolYear() - 12}-06-01`));
    const [profile] = await getProfiles(owner);
    expect(profile?.grade).toBe(6);
    expect(profile?.storedGrade).toBe(6);
  });

  it("só o dono edita, e a trilha precisa caber no ano escolhido", async () => {
    await expect(
      updateProfile(stranger, {
        profileId,
        nickname: "Sol",
        grade: 7,
        birthMonth: null,
        avatar: "lua",
        courseId: "canguru-b",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateProfile(owner, {
        profileId,
        nickname: "Sol",
        grade: 7,
        birthMonth: null,
        avatar: "lua",
        courseId: "canguru-e",
      }),
    ).rejects.toMatchObject({ code: "COURSE" });
    await expect(
      updateProfile(owner, {
        profileId,
        nickname: "Sol",
        grade: 9,
        birthMonth: null,
        avatar: "lua",
        courseId: "canguru-b",
      }),
    ).rejects.toMatchObject({ code: "COURSE" });
    const updated = await updateProfile(owner, {
      profileId,
      nickname: "Sol",
      grade: 7,
      birthMonth: null,
      avatar: "lua",
      courseId: "canguru-b",
    });
    expect(updated).toMatchObject({ grade: 7, avatar: "lua", courseId: "canguru-b" });
    expect(updated.birthMonth).toBeNull();
  });

  it("avança o ano na virada e leva a trilha para a sucessora na primeira missão", async () => {
    // Volta o perfil para o 6º ano no Canguru E, gravado como se fosse o ano passado.
    await db
      .update(missaoProfiles)
      .set({ grade: 6, courseId: "canguru-e", gradeYear: schoolYear() - 1 })
      .where(eq(missaoProfiles.id, profileId));
    const painel = await dashboard(owner, profileId);
    expect(painel.profile?.grade).toBe(7);
    expect(painel.courseTransition?.from.id).toBe("canguru-e");
    expect(painel.courseTransition?.to?.id).toBe("canguru-b");
    expect(painel.course?.id).toBe("canguru-b");
    // Nada foi gravado só por ler.
    const [antes] = await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profileId));
    expect(antes?.courseId).toBe("canguru-e");
    await begin(owner, {
      profileId,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    const [depois] = await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, profileId));
    expect(depois?.courseId).toBe("canguru-b");
    expect((await dashboard(owner, profileId)).courseTransition).toBeNull();
  });

  it("mantém a trilha atual quando o ano novo ainda não tem trilha publicada", async () => {
    await db
      .update(missaoProfiles)
      .set({ grade: 7, courseId: "obmep-n1", gradeYear: schoolYear() - 1 })
      .where(eq(missaoProfiles.id, profileId));
    const painel = await dashboard(owner, profileId);
    expect(painel.profile?.grade).toBe(8);
    expect(painel.courseTransition?.to).toBeNull();
    expect(painel.course?.id).toBe("obmep-n1");
    const sessao = await begin(owner, {
      profileId,
      lessonId: "fracoes-1",
      mode: "mission",
      requestKey: randomUUID(),
    });
    expect(sessao.lessonId).toBe("fracoes-1");
  });
});
