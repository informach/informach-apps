import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaNotificationDeliveries,
  agendaNotificationPreferences,
  agendaTasks,
} from "@informach/db/schema";
import { beforeEach, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "synthetic-public";
  process.env.VAPID_PRIVATE_KEY = "synthetic-private";
  return {
    emails: [] as { subject: string; text: string; messageKey: string }[],
    pushes: [] as string[],
    beforeAuthorize: null as null | (() => Promise<void>),
  };
});
vi.mock("@/lib/emails", () => ({
  buildEmailUnsubscribeUrl: () => "https://example.test/unsubscribe",
  emails: {
    sendEmail: vi.fn(
      async (input: {
        subject: string;
        text: string;
        messageKey: string;
        authorizeContent: () => Promise<boolean>;
      }) => {
        await transport.beforeAuthorize?.();
        let permitted = false;
        try {
          permitted = await input.authorizeContent();
        } catch {
          /* revoked */
        }
        if (!permitted) return { ok: false, status: "skipped" };
        transport.emails.push({
          subject: input.subject,
          text: input.text,
          messageKey: input.messageKey,
        });
        return { ok: true, status: "sent" };
      },
    ),
  },
}));
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (_device: unknown, payload: string) => {
      transport.pushes.push(payload);
      return {};
    }),
  },
}));

import { currentMessages, deliverRoutineNotifications } from "@/features/notifications/delivery";
import {
  claim,
  currentEmail,
  finish,
  isCurrentDelivery,
  listRecipients,
} from "@/features/notifications/delivery-repository";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/schemas";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  subscribePush,
  unsubscribePush,
} from "@/features/notifications/service";
import { createStudentProfile } from "@/features/students/service";
import { agendaFixture, family, value } from "./compasso-fixture";

const now = new Date("2026-11-10T22:00:00Z");
const enabled = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  emailEnabled: true,
  weeklyDigestEnabled: false,
};
beforeEach(async () => {
  transport.emails.length = 0;
  transport.pushes.length = 0;
  transport.beforeAuthorize = null;
  await db.update(agendaNotificationPreferences).set({ emailEnabled: false, pushEnabled: false });
});
async function task(profileId: string, userId: string, title = "Private school task") {
  await db.insert(agendaTasks).values({
    profileId,
    createdByUserId: userId,
    type: "task",
    title,
    dueAt: "2026-11-10",
    dateOrigin: "school",
    fingerprint: randomUUID(),
  });
}
async function secondFamily(f: Awaited<ReturnType<typeof agendaFixture>>) {
  const owner = f.visitor.userId;
  const group = await family.createGroup(owner, "Second home");
  await startCompassoTrial(
    { db, trialHashSecret: "agenda-test-trial-secret".repeat(3) },
    owner,
    group.id,
  );
  const invitation = await family.createInvitation(owner, group.id, `${f.owner}@example.test`);
  await family.acceptInvitation(f.owner, invitation.token);
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Second child",
  });
  const profile = value(
    await createStudentProfile(
      { userId: owner, familyGroupId: group.id },
      { personId: person.id, birthDate: null },
    ),
  );
  await family.grantAccess(owner, {
    groupId: group.id,
    personId: person.id,
    userId: f.owner,
    app: "agenda-da-turma",
    action: "read",
  });
  return { actor: { userId: f.owner, familyGroupId: group.id }, profile };
}
it("keeps preferences and notification contents separate for one adult in two homes", async () => {
  const f = await agendaFixture(true),
    second = await secondFamily(f);
  value(await saveNotificationPreferences(f.actor, enabled));
  value(await saveNotificationPreferences(second.actor, { ...enabled, digestHour: 18 }));
  expect((await getNotificationPreferences(f.actor)).digestHour).toBe(19);
  expect((await getNotificationPreferences(second.actor)).digestHour).toBe(18);
  await task(f.profile.id, f.owner, "Home one secret");
  await task(second.profile.id, f.owner, "Home two secret");
  const messages = await currentMessages(f.actor, now);
  expect(JSON.stringify(messages)).toContain("Home one secret");
  expect(JSON.stringify(messages)).not.toContain("Home two secret");
  expect(await currentMessages(second.actor, now)).toHaveLength(0);
});
it("only includes currently granted children and rebuilds after revocation", async () => {
  const f = await agendaFixture(true);
  const person = await family.createPerson(f.owner, {
    groupId: f.actor.familyGroupId,
    kind: "dependent",
    displayName: "Hidden sibling",
  });
  const sibling = value(
    await createStudentProfile(f.actor, { personId: person.id, birthDate: null }),
  );
  await task(f.profile.id, f.owner, "Granted task");
  await task(sibling.id, f.owner, "Sibling secret");
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  value(await saveNotificationPreferences(f.visitor, enabled));
  expect(JSON.stringify(await currentMessages(f.visitor, now))).toContain("Granted task");
  expect(JSON.stringify(await currentMessages(f.visitor, now))).not.toContain("Sibling secret");
  await family.revokeAccess(f.owner, { ...f.target, action: "read" });
  expect(await currentMessages(f.visitor, now)).toHaveLength(0);
});
it("claims simultaneous jobs once per family and paginates two homes of the same adult", async () => {
  const f = await agendaFixture(true),
    second = await secondFamily(f);
  for (const [actor, profile] of [
    [f.actor, f.profile],
    [second.actor, second.profile],
  ] as const) {
    value(await saveNotificationPreferences(actor, enabled));
    await task(profile.id, f.owner);
  }
  const first = await deliverRoutineNotifications(now, { limit: 1 });
  expect(first.hasMore).toBe(true);
  expect(transport.emails).toHaveLength(1);
  await Promise.all([
    deliverRoutineNotifications(now, { afterPreferenceId: first.cursor, limit: 1 }),
    deliverRoutineNotifications(now, { afterPreferenceId: first.cursor, limit: 1 }),
  ]);
  expect(transport.emails).toHaveLength(2);
  expect(new Set(transport.emails.map((e) => e.messageKey)).size).toBe(2);
  expect(transport.emails.some((e) => e.text.includes(f.actor.familyGroupId))).toBe(true);
  expect(transport.emails.some((e) => e.text.includes(second.actor.familyGroupId))).toBe(true);
  const deliveries = await db
    .select()
    .from(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, f.owner));
  expect(deliveries.filter((d) => d.status === "sent")).toHaveLength(2);
});
it("rechecks content permission at the email transport boundary", async () => {
  const f = await agendaFixture(true);
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  value(await saveNotificationPreferences(f.visitor, enabled));
  await task(f.profile.id, f.owner);
  transport.beforeAuthorize = () =>
    family.revokeAccess(f.owner, { ...f.target, action: "read" }).then(() => undefined);
  await deliverRoutineNotifications(now);
  expect(transport.emails).toHaveLength(0);
  const [delivery] = await db
    .select()
    .from(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, f.visitor.userId));
  expect(delivery?.status).toBe("canceled");
});
it("discards an email when its adult freezes and admits no new deliveries", async () => {
  const f = await agendaFixture(true);
  value(await saveNotificationPreferences(f.actor, enabled));
  await task(f.profile.id, f.owner);
  transport.beforeAuthorize = async () => {
    await db.transaction((tx) =>
      freezeWebParticipation(tx, {
        userId: f.owner,
        operationId: randomUUID(),
        expectedRevision: 0,
      }),
    );
  };
  await deliverRoutineNotifications(now);
  expect(transport.emails).toHaveLength(0);
  expect(await currentEmail(f.owner)).toBeUndefined();
  expect((await listRecipients(null, 50)).some((row) => row.preferences.userId === f.owner)).toBe(
    false,
  );
  expect(await claim(f.actor, "email", "after-freeze")).toBeNull();
  const rows = await db
    .select()
    .from(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, f.owner));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.status).toBe("canceled");
});
it("does not revive a prepared email after suspension and resumption", async () => {
  const f = await agendaFixture(true);
  value(await saveNotificationPreferences(f.actor, enabled));
  await task(f.profile.id, f.owner);
  transport.beforeAuthorize = async () => {
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: f.owner, operationId, expectedRevision: 0 }),
    );
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: f.owner, operationId, expectedRevision: 1 }),
    );
    transport.beforeAuthorize = null;
  };
  await deliverRoutineNotifications(now);
  expect(transport.emails).toHaveLength(0);
  expect(await currentEmail(f.owner)).toBe(`${f.owner}@example.test`);
  const [delivery] = await db
    .select()
    .from(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, f.owner));
  expect(delivery).toMatchObject({ status: "canceled", webParticipationRevision: 0 });
});
it("fences expired and reclaimed delivery attempts without coupling admission to the message date", async () => {
  const f = await agendaFixture(true);
  const old = await claim(f.actor, "email", "deadline");
  if (!old) throw new Error("Missing claim");
  expect(await isCurrentDelivery(f.actor, old)).toBe(true);
  expect(await isCurrentDelivery(f.visitor, old)).toBe(false);
  await db
    .update(agendaNotificationDeliveries)
    .set({ lastAttemptAt: sql`clock_timestamp() - interval '11 minutes'` })
    .where(eq(agendaNotificationDeliveries.id, old.id));
  expect(await isCurrentDelivery(f.actor, old)).toBe(false);
  await finish(old, "sent", now);
  const reclaimed = await claim(f.actor, "email", "deadline");
  if (!reclaimed) throw new Error("Missing replacement claim");
  expect(await isCurrentDelivery(f.actor, reclaimed)).toBe(true);
  await finish(old, "sent", now);
  expect(await isCurrentDelivery(f.actor, reclaimed)).toBe(true);
  await finish(reclaimed, "sent", now);
  expect(await isCurrentDelivery(f.actor, reclaimed)).toBe(false);
});
it("sends generic lock-screen text with explicit family context and respects device removal", async () => {
  const f = await agendaFixture(true);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  value(
    await subscribePush(f.actor, {
      endpoint,
      keys: { p256dh: `B${"a".repeat(86)}`, auth: "a".repeat(22) },
    }),
  );
  value(
    await saveNotificationPreferences(f.actor, {
      ...enabled,
      emailEnabled: false,
      pushEnabled: true,
    }),
  );
  await task(f.profile.id, f.owner, "Secret examination");
  await deliverRoutineNotifications(now);
  expect(transport.pushes).toHaveLength(1);
  expect(transport.pushes[0]).not.toMatch(/Secret|examination|Child/);
  expect(JSON.parse(transport.pushes[0] ?? "{}").url).toContain(f.actor.familyGroupId);
  value(await unsubscribePush(f.owner, endpoint));
  await deliverRoutineNotifications(new Date("2026-11-11T22:00:00Z"));
  expect(transport.pushes).toHaveLength(1);
});
it("refuses preference and device writes in an unrelated family", async () => {
  const f = await agendaFixture(true),
    other = await agendaFixture(true);
  const forged = { userId: f.owner, familyGroupId: other.actor.familyGroupId };
  await expect(saveNotificationPreferences(forged, enabled)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(getNotificationPreferences(forged)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(
    await db
      .select()
      .from(agendaNotificationPreferences)
      .where(
        and(
          eq(agendaNotificationPreferences.userId, f.owner),
          eq(agendaNotificationPreferences.familyGroupId, other.actor.familyGroupId),
        ),
      ),
  ).toHaveLength(0);
});
