import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { emailDeliveries, missaoFamilies, missaoProfiles, users } from "@informach/db/schema";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/jobs/weekly-report/route";
import * as summary from "@/features/family/resumo-semanal";
import { setWeeklyReportEmail } from "@/features/learning/repository";
import { emails } from "@/lib/emails";
import { env } from "@/lib/env";

const owner = randomUUID();
const recipient = `${owner}@example.test`;

beforeAll(async () => {
  await db.insert(users).values({
    id: owner,
    email: recipient,
    name: "Revisão de backend",
    emailVerified: true,
  });
  await db.insert(missaoFamilies).values({ userId: owner, consentVersion: "test" });
  await db.insert(missaoProfiles).values({
    userId: owner,
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId: "olitef-n1",
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  emails.clearOutbox();
  await setWeeklyReportEmail(owner, false);
  await db
    .update(missaoFamilies)
    .set({ weeklyReportProcessedWeek: null })
    .where(eq(missaoFamilies.userId, owner));
  await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, owner));
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, owner));
});

function request() {
  return new Request("http://localhost:3005/api/jobs/weekly-report", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
}

describe("revisão backend: envio do resumo semanal", () => {
  it("respeita o desligamento pelo app ocorrido depois de selecionar o lote", async () => {
    await setWeeklyReportEmail(owner, true);
    const buildSummary = summary.buildWeeklySummary;
    // Reproduz a alteração real de consentimento enquanto o lote está em curso.
    // A consulta e a composição do resumo continuam usando a implementação real.
    vi.spyOn(summary, "buildWeeklySummary").mockImplementation(async (...args) => {
      if (args[0] === owner) await setWeeklyReportEmail(owner, false);
      return buildSummary(...args);
    });
    await POST(request());
    expect(emails.getOutbox().filter((email) => email.to === recipient)).toHaveLength(0);
  });

  it("sinaliza ao cron uma falha de entrega retornada pelo transportador", async () => {
    await setWeeklyReportEmail(owner, true);
    vi.spyOn(emails, "sendEmail").mockResolvedValue({
      ok: false,
      status: "failed",
      deliveryId: randomUUID(),
      reason: "temporary provider outage",
    });
    const response = await POST(request());
    expect((await response.json()).falhas).toBeGreaterThan(0);
    expect(response.status).toBe(503);
  });
});
