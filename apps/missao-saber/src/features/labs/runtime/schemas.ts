import { z } from "zod";

const stateSchema = z
  .record(z.string(), z.unknown())
  .refine((state) => JSON.stringify(state).length <= 32000, "Montagem muito grande.");
export const labDocumentSchema = z
  .object({
    stage: z.enum(["prediction", "investigate", "observe", "explain", "transfer"]),
    free: z.boolean(),
    state: stateSchema,
    transferState: stateSchema,
    comparison: stateSchema.nullable(),
    prediction: z.string().max(1000),
    observation: z.string().max(1000),
    explanation: z.string().max(2000),
    answer: z.string().max(1000),
    transferAnswer: z.string().max(1000),
    transferHelp: z.boolean().optional(),
    rubric: z.array(z.number().int().min(0).max(20)).max(20),
  })
  .refine(
    (document) => new TextEncoder().encode(JSON.stringify(document)).byteLength <= 48000,
    "Esta investigação excede o tamanho permitido. Reduza as anotações ou a montagem.",
  );
export type LabDocument = z.infer<typeof labDocumentSchema>;
export const labContextSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().min(1).max(160),
});
export const startLabSchema = z.object({
  profileId: z.string().uuid(),
  id: z.string().uuid(),
  experienceId: z.string().max(200),
  context: labContextSchema.optional(),
  duplicateId: z.string().uuid().optional(),
  noteId: z.string().uuid().optional(),
  legacyKind: z.enum(["bars", "grid", "groups"]).optional(),
});
export const saveLabSchema = z.object({
  profileId: z.string().uuid(),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  document: labDocumentSchema,
});
export const labAssessmentSchema = z.object({
  correct: z.boolean().nullable(),
  message: z.string(),
  summary: z.string(),
});
export const labAttachmentSchema = z.object({
  version: z.literal(1),
  executionId: z.string().uuid(),
  experienceId: z.string(),
  experienceVersion: z.number().int().positive().optional(),
  grade: z.number().int().min(1).max(12).optional(),
  revision: z.number().int().positive().optional(),
  title: z.string(),
  skill: z.string(),
  question: z.string(),
  savedAt: z.string(),
  summary: z.string(),
  document: labDocumentSchema,
  assessment: labAssessmentSchema.nullable(),
  transfer: z.object({ question: z.string(), summary: z.string() }).nullable().default(null),
  missionContext: z
    .object({
      sessionId: z.string().uuid(),
      itemId: z.string(),
      title: z.string(),
      prompt: z.string(),
    })
    .nullable()
    .default(null),
});
export type LabAttachment = z.infer<typeof labAttachmentSchema>;
