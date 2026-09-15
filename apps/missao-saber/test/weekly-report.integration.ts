import { randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { emailUnsubscribes, missaoFamilies, missaoProfiles, users } from "@informach/db/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWeeklySummary } from "@/features/family/resumo-semanal";
import {
  listFamiliesForWeeklyReport,
  setWeeklyReportEmail,
  weeklyReportUnsubscribed,
} from "@/features/learning/repository";

const assinante = randomUUID();
const cancelou = randomUUID();
const semPerfil = randomUUID();

beforeAll(async () => {
  await db.insert(users).values([
    { id: assinante, email: `${assinante}@example.test`, name: "Casa um", emailVerified: true },
    { id: cancelou, email: `${cancelou}@example.test`, name: "Casa dois", emailVerified: true },
    { id: semPerfil, email: `${semPerfil}@example.test`, name: "Casa três", emailVerified: true },
  ]);
  await db.insert(missaoFamilies).values([
    { userId: assinante, consentVersion: "test" },
    { userId: cancelou, consentVersion: "test" },
    { userId: semPerfil, consentVersion: "test" },
  ]);
  await db.insert(missaoProfiles).values({
    userId: assinante,
    nickname: "Sol",
    grade: 6,
    avatar: "cometa",
    courseId: "olitef-n1",
  });
});

describe("resumo semanal em PostgreSQL isolado", () => {
  it("só lista quem ligou o resumo e ainda não cancelou pelo e-mail", async () => {
    await setWeeklyReportEmail(assinante, true);
    await setWeeklyReportEmail(cancelou, true);
    expect((await listFamiliesForWeeklyReport()).map((linha) => linha.userId).sort()).toEqual(
      [assinante, cancelou].sort(),
    );
    // O link do e-mail escreve direto na tabela de cancelamento; a lista de
    // envio precisa respeitá-lo, senão o cancelamento não cancela nada.
    await db
      .insert(emailUnsubscribes)
      .values({ userId: cancelou, category: "missao.weekly-report" });
    expect(await weeklyReportUnsubscribed(cancelou)).toBe(true);
    expect((await listFamiliesForWeeklyReport()).map((linha) => linha.userId)).toEqual([assinante]);
    // Religar pelo app desfaz o cancelamento: sem isso o botão diria "ativado"
    // e a entrega continuaria descartando todo envio, em silêncio.
    await setWeeklyReportEmail(cancelou, true);
    expect(await weeklyReportUnsubscribed(cancelou)).toBe(false);
    expect((await listFamiliesForWeeklyReport()).map((linha) => linha.userId).sort()).toEqual(
      [assinante, cancelou].sort(),
    );
    await setWeeklyReportEmail(cancelou, false);
    expect((await listFamiliesForWeeklyReport()).map((linha) => linha.userId)).toEqual([assinante]);
  });

  it("monta o resumo da casa e não inventa corpo para família sem estudante", async () => {
    const agora = new Date();
    expect(
      await buildWeeklySummary(
        semPerfil,
        `${semPerfil}@example.test`,
        "https://exemplo.test",
        agora,
      ),
    ).toBeNull();
    const resumo = await buildWeeklySummary(
      assinante,
      `${assinante}@example.test`,
      "https://exemplo.test",
      agora,
    );
    if (!resumo) throw new Error("Missing summary");
    expect(resumo.texto).toContain("Sol");
    expect(resumo.html).toContain("https://exemplo.test/familia");
    // O resumo vai para a conta do responsável e diz isso no corpo.
    expect(resumo.texto).toContain("Nenhum lembrete é enviado ao estudante.");
    expect(resumo.semana).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
