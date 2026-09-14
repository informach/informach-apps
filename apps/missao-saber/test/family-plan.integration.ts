import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { customers, subscriptions, users } from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { retainProfilesForSmallerPlan } from "@/features/billing/repository";
import { findLesson } from "@/features/content/catalog";
import { getProfiles, history } from "@/features/learning/repository";
import { answer, begin, createProfile, dashboard } from "@/features/learning/service";

const owner = randomUUID();
let customerId = "";
let subscriptionId = "";
const profileIds: string[] = [];
const profileInput = {
  nickname: "Estudante",
  grade: 6,
  avatar: "cometa" as const,
  courseId: "olitef-n1",
  consent: true,
};

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: `${owner}@example.test`,
    name: "Family plan test",
    emailVerified: true,
  });
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_family_${owner}`,
      subjectType: "user",
      subjectId: owner,
      app: "missao-saber",
      email: `${owner}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing family customer fixture");
  customerId = customer.id;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId,
      provider: "stripe",
      providerSubscriptionId: `sub_family_${owner}`,
      productId: "missao_family_monthly",
      providerPriceId: "price_family_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  if (!subscription) throw new Error("Missing family subscription fixture");
  subscriptionId = subscription.id;
});

afterAll(async () => {
  if (subscriptionId) await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  await db.delete(users).where(eq(users.id, owner));
});

describe("family capacity and isolated student progress", () => {
  it("serializes concurrent creation and refuses a fourth student on the server", async () => {
    const results = await Promise.allSettled(
      ["Sol", "Lua", "Nina", "Teo"].map((nickname) =>
        createProfile(owner, { ...profileInput, nickname }),
      ),
    );
    const created = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    profileIds.push(...created.map((profile) => profile.id));

    expect(created).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await getProfiles(owner)).toHaveLength(3);
  });

  it("keeps simultaneous sessions and evidence separate for each student", async () => {
    const [first, second] = profileIds;
    if (!first || !second) throw new Error("Missing student profiles");
    const lesson = findLesson("porcentagem-1");
    const firstItem = lesson?.items[0];
    if (!lesson || firstItem?.type !== "choice") throw new Error("Missing paid lesson fixture");

    const [firstSession, secondSession] = await Promise.all([
      begin(owner, {
        profileId: first,
        lessonId: lesson.id,
        mode: "mission",
        requestKey: randomUUID(),
      }),
      begin(owner, {
        profileId: second,
        lessonId: lesson.id,
        mode: "mission",
        requestKey: randomUUID(),
      }),
    ]);
    await answer(owner, {
      sessionId: firstSession.id,
      itemId: firstItem.id,
      answer: firstItem.answer,
      requestKey: randomUUID(),
    });

    expect(firstSession.profileId).toBe(first);
    expect(secondSession.profileId).toBe(second);
    expect((await history(owner, first)).evidence).toHaveLength(1);
    expect((await history(owner, second)).evidence).toHaveLength(0);
  });

  it("preserves all profiles on downgrade and activates only the parent's selection", async () => {
    const [first, retained] = profileIds;
    if (!first || !retained) throw new Error("Missing student profiles");

    await expect(retainProfilesForSmallerPlan(owner, [], 1)).rejects.toMatchObject({
      code: "PROFILE_SELECTION",
    });
    expect((await getProfiles(owner)).every((profile) => profile.accessEnabled)).toBe(true);

    await retainProfilesForSmallerPlan(owner, [retained], 1);
    expect(new Set((await dashboard(owner, first)).activeProfileIds)).toEqual(new Set(profileIds));

    await db
      .update(subscriptions)
      .set({ productId: "missao_individual_monthly" })
      .where(eq(subscriptions.id, subscriptionId));
    const after = await dashboard(owner, retained);
    expect(after.activeProfileIds).toEqual([retained]);
    expect(after.profiles).toHaveLength(3);
    expect(after.profileAllowed).toBe(true);

    await expect(
      begin(owner, {
        profileId: first,
        lessonId: "porcentagem-2",
        mode: "mission",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PROFILE_LIMIT" });
  });
});
