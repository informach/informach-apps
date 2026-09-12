import "server-only";
import { db } from "@informach/db";
import { agendaProductEvents } from "@informach/db/schema";
import { type LandingEvent, landingEventSchema } from "./landing-schema";

export async function recordLandingEvent(input: LandingEvent) {
  const parsed = landingEventSchema.parse(input);
  const { event, ...context } = parsed;
  const values: (typeof agendaProductEvents.$inferInsert)[] = [{ event, landingContext: context }];
  // Preserve the existing meaning: first signup click in this page instance.
  if (parsed.event === "landing_cta" && parsed.firstCta) {
    values.push({ event: "qualified_visit" });
  }
  // A single INSERT keeps the CTA and its legacy counterpart atomic.
  return db.insert(agendaProductEvents).values(values).returning({ id: agendaProductEvents.id });
}
