import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import { agendaProductEvents, users } from "@informach/db/schema";
import { afterEach, beforeEach, expect, it } from "vitest";
import { todayLocalIso } from "@/features/dashboard/date";
import { recordTodayViewedOnce } from "@/features/metrics/events";

let owner: string;
beforeEach(async () => {
  owner = `today-viewed-${randomUUID()}`;
  await db.insert(users).values({
    id: owner,
    name: "Adulto fictício",
    email: `${owner}@e2e.local`,
    emailVerified: true,
  });
});
afterEach(async () => {
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

it("conta uma abertura de Hoje por adulto por dia, mesmo com duas abas ao mesmo tempo", async () => {
  // Duas abas abrindo juntas passavam as duas pela consulta antes de qualquer
  // uma gravar, e o dia contava duas vezes.
  const results = await Promise.all(
    Array.from({ length: 4 }, () => recordTodayViewedOnce(owner, todayLocalIso())),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  const rows = await db
    .select()
    .from(agendaProductEvents)
    .where(
      and(eq(agendaProductEvents.userId, owner), eq(agendaProductEvents.event, "today_viewed")),
    );
  expect(rows).toHaveLength(1);
  // Nada além do dia: nem criança, nem contagem, nem origem.
  expect(rows[0]).toMatchObject({ source: null, count: null, durationMs: null });
});
