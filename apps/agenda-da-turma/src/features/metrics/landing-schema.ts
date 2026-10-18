import { z } from "zod";

/**
 * A versão da página que gerou o evento. Mudou com a página do dia (outubro
 * de 2026) para separar a medição: "primeiro recado salvo por variante" só diz
 * alguma coisa se as duas páginas não se misturarem. Eventos antigos ficam com
 * `family-routine-v1` no banco.
 */
export const LANDING_VARIANT = "pagina-do-dia-v1" as const;
// A anterior continua aceita: uma aba aberta antes do deploy ainda manda os
// eventos dela, e recusá-los apagaria a última medição da página antiga.
const variant = z.enum(["family-routine-v1", LANDING_VARIANT]);
// `sticky`: a barra fixa do celular.
export const landingPlacementSchema = z.enum(["hero", "demo", "pricing", "final", "sticky"]);
export const landingScenarioSchema = z.enum(["cartaz", "passeio", "prova", "material"]);
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
