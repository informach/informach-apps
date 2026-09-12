import { db, inArray } from "@informach/db";
import { agendaProductEvents } from "@informach/db/schema";
import { afterEach, expect, it } from "vitest";
import { recordLandingEvent } from "@/features/metrics/landing-events";
import { LANDING_VARIANT } from "@/features/metrics/landing-schema";

const ids: string[] = [];
afterEach(async () => {
  if (ids.length)
    await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.id, ids.splice(0)));
});
it("stores anonymous landing context and exactly one legacy event for the first CTA", async () => {
  for (const firstCta of [true, false]) {
    const inserted = await recordLandingEvent({
      event: "landing_cta",
      variant: LANDING_VARIANT,
      placement: "pricing",
      selection: { plan: "pro", cycle: "annual" },
      firstCta,
    });
    ids.push(...inserted.map((row) => row.id));
  }
  const rows = await db
    .select()
    .from(agendaProductEvents)
    .where(inArray(agendaProductEvents.id, ids));
  expect(rows.filter((row) => row.event === "qualified_visit")).toHaveLength(1);
  const ctas = rows.filter((row) => row.event === "landing_cta");
  expect(ctas).toHaveLength(2);
  for (const row of ctas) {
    expect(row.userId).toBeNull();
    expect(row.source).toBeNull();
    expect(row.landingContext).toMatchObject({
      variant: LANDING_VARIANT,
      placement: "pricing",
      selection: { plan: "pro", cycle: "annual" },
    });
  }
});
it("records a page view without creating a qualified signup click", async () => {
  const inserted = await recordLandingEvent({ event: "landing_view", variant: LANDING_VARIANT });
  ids.push(...inserted.map((row) => row.id));
  const rows = await db
    .select()
    .from(agendaProductEvents)
    .where(inArray(agendaProductEvents.id, ids));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    event: "landing_view",
    userId: null,
    landingContext: { variant: LANDING_VARIANT },
  });
});
