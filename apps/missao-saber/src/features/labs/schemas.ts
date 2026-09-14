import { z } from "zod";

export const experimentSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("bars"),
      initial: z.number().min(20).max(500),
      first: z.number().min(0).max(60),
      second: z.number().min(0).max(60),
    }),
    z.object({ kind: z.literal("grid"), cells: z.array(z.boolean()).length(20) }),
    z.object({
      kind: z.literal("groups"),
      groups: z.number().int().min(2).max(6),
      tokens: z
        .array(
          z.object({ id: z.number().int().min(0).max(10000), box: z.number().int().min(0).max(5) }),
        )
        .min(1)
        .max(12),
    }),
  ])
  .refine(
    (value) =>
      value.kind !== "groups" ||
      (new Set(value.tokens.map((t) => t.id)).size === value.tokens.length &&
        value.tokens.every((t) => t.box < value.groups)),
    "Invalid groups",
  );
export type Experiment = z.infer<typeof experimentSchema>;
export type SavedExperiment = { state: Experiment; revision: number };
