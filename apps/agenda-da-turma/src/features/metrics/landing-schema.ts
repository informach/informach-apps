import { z } from "zod";

export const LANDING_VARIANT = "family-routine-v1" as const;
const variant = z.literal(LANDING_VARIANT);
export const landingPlacementSchema = z.enum(["hero", "demo", "pricing", "final"]);
export const landingScenarioSchema = z.enum(["passeio", "prova", "material"]);
export type LandingPlacement = z.infer<typeof landingPlacementSchema>;
export type LandingScenario = z.infer<typeof landingScenarioSchema>;

// No free text, URLs, identity or school content crosses this public boundary.
export const landingEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("landing_view"), variant }).strict(),
  z
    .object({
      event: z.literal("landing_cta"),
      variant,
      placement: landingPlacementSchema,
      selection: z.discriminatedUnion("plan", [
        z.object({ plan: z.literal("free") }).strict(),
        z.object({ plan: z.literal("pro"), cycle: z.enum(["monthly", "annual"]) }).strict(),
      ]),
      firstCta: z.boolean(),
    })
    .strict(),
  z
    .object({
      event: z.literal("landing_demo"),
      variant,
      scenario: landingScenarioSchema,
      action: z.enum(["scenario", "plan", "complete"]),
    })
    .strict(),
]);
export type LandingEvent = z.infer<typeof landingEventSchema>;
