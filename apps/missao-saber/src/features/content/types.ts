import { z } from "zod";

export const modeSchema = z.enum(["mission", "review", "diagnostic", "exam"]);
export type SessionMode = z.infer<typeof modeSchema>;

export const itemSourceSchema = z.object({
  lessonId: z.string(),
  version: z.number().int().positive(),
});
const explorationSchema = z.object({
  kind: z.enum(["bars", "grid", "groups"]),
  instruction: z.string(),
  alternativeText: z.string(),
});
const commonItemSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  familyId: z.string(),
  prompt: z.string(),
  explanation: z.string(),
  hints: z.array(z.string()).length(3),
  purpose: z
    .enum(["discovery", "guided-practice", "independent-practice", "assessment"])
    .default("guided-practice"),
  domain: z.enum(["common", "olitef", "canguru", "obmep"]).default("common"),
  source: itemSourceSchema.optional(),
  exploration: explorationSchema.optional(),
});
const choiceItemSchema = commonItemSchema
  .extend({
    type: z.literal("choice"),
    options: z.array(z.string()).min(2).max(6),
    answer: z.string(),
    misconceptions: z.record(z.string()),
  })
  .superRefine((item, context) => {
    if (new Set(item.options).size !== item.options.length)
      context.addIssue({ code: "custom", message: "Choice options must be unique" });
    if (!item.options.includes(item.answer))
      context.addIssue({ code: "custom", message: "Choice answer must be an option" });
    for (const option of item.options)
      if (option !== item.answer && !item.misconceptions[option])
        context.addIssue({ code: "custom", message: `Missing feedback for ${option}` });
  });
const numericFormSchema = z.enum(["integer", "decimal", "fraction"]);
const numericItemSchema = commonItemSchema
  .extend({
    type: z.literal("numeric"),
    grading: z.object({
      value: z.number().finite(),
      tolerance: z.number().finite().nonnegative().default(0),
      acceptedForms: z.array(numericFormSchema).min(1),
      unit: z
        .object({
          symbol: z.string().min(1),
          aliases: z.array(z.string().min(1)).default([]),
          required: z.boolean().default(false),
        })
        .optional(),
    }),
  })
  .refine(
    (item) => new Set(item.grading.acceptedForms).size === item.grading.acceptedForms.length,
    {
      message: "Numeric accepted forms must be unique",
    },
  );
const orderingItemSchema = commonItemSchema
  .extend({
    type: z.literal("ordering"),
    steps: z
      .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
      .min(2)
      .max(8),
    grading: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("exact"), order: z.array(z.string()).min(2).max(8) }),
      z.object({
        mode: z.literal("precedence"),
        constraints: z
          .array(z.tuple([z.string(), z.string()]))
          .min(1)
          .max(20),
      }),
    ]),
  })
  .superRefine((item, context) => {
    const ids = new Set(item.steps.map((step) => step.id));
    if (ids.size !== item.steps.length)
      context.addIssue({ code: "custom", message: "Ordering step ids must be unique" });
    const referenced =
      item.grading.mode === "exact" ? item.grading.order : item.grading.constraints.flat();
    if (
      referenced.some((id) => !ids.has(id)) ||
      (item.grading.mode === "exact" &&
        (item.grading.order.length !== ids.size ||
          new Set(item.grading.order).size !== item.grading.order.length))
    )
      context.addIssue({
        code: "custom",
        message: "Ordering rule must reference valid steps exactly once",
      });
  });
const justificationItemSchema = commonItemSchema
  .extend({
    type: z.literal("justification"),
    response: z.object({
      label: z.string(),
      minLength: z.number().int().min(10).max(500),
      maxLength: z.number().int().min(20).max(2000),
    }),
    rubric: z.array(z.string().min(1)).min(1).max(6),
    sampleResponse: z.string().min(1),
  })
  .refine((item) => item.response.maxLength >= item.response.minLength, {
    message: "Justification maximum length must be at least its minimum",
  });
const currentItemSchema = z.union([
  choiceItemSchema,
  numericItemSchema,
  orderingItemSchema,
  justificationItemSchema,
]);

// Snapshots created before contract v2 did not store a discriminator. They
// remain choice items and keep their frozen answer and feedback.
export const itemSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || "type" in value) return value;
  return { ...value, type: "choice" };
}, currentItemSchema);
export type Item = z.infer<typeof itemSchema>;

export const lessonSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  skillId: z.string(),
  objective: z.string(),
  introduction: z.string(),
  lab: z.enum(["bars", "grid", "groups"]).nullable(),
  free: z.boolean(),
  kind: z.enum(["mission", "assessment-bank", "assessment"]).default("mission"),
  stage: z.enum(["discover", "practice", "challenge", "assessment"]).default("practice"),
  prerequisites: z.array(z.string()).default([]),
  estimatedMinutes: z.number().int().min(3).max(60).default(12),
  assessmentNovelty: z.enum(["fresh", "mixed", "practice"]).optional(),
  items: z.array(itemSchema).min(1),
});
export type Lesson = z.infer<typeof lessonSchema>;

type PublicCommon = Pick<Item, "id" | "prompt" | "skillId" | "type" | "exploration">;
export type PublicItem =
  | (PublicCommon & { type: "choice"; options: string[] })
  | (PublicCommon & {
      type: "numeric";
      numeric: {
        acceptedForms: ("integer" | "decimal" | "fraction")[];
        unit?: { symbol: string; required: boolean };
      };
    })
  | (PublicCommon & {
      type: "ordering";
      steps: { id: string; label: string }[];
    })
  | (PublicCommon & {
      type: "justification";
      response: { label: string; minLength: number; maxLength: number };
    });
export type PublicLesson = Omit<Lesson, "items"> & { items: PublicItem[] };
export type Course = {
  id: string;
  title: string;
  label: string;
  grades: number[];
  description: string;
  skills: string[];
  path: string[];
};

export function publicItem(item: Item): PublicItem {
  const common = {
    id: item.id,
    prompt: item.prompt,
    skillId: item.skillId,
    type: item.type,
    exploration: item.exploration,
  };
  switch (item.type) {
    case "choice":
      return { ...common, type: item.type, options: item.options };
    case "numeric":
      return {
        ...common,
        type: item.type,
        numeric: {
          acceptedForms: item.grading.acceptedForms,
          unit: item.grading.unit
            ? { symbol: item.grading.unit.symbol, required: item.grading.unit.required }
            : undefined,
        },
      };
    case "ordering":
      return { ...common, type: item.type, steps: item.steps };
    case "justification":
      return { ...common, type: item.type, response: item.response };
  }
}

export function publicLesson(lesson: Lesson): PublicLesson {
  return { ...lesson, items: lesson.items.map(publicItem) };
}
