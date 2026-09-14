import { z } from "zod";
import { activityTypeSchema } from "@/features/unified-activities/activity-types";

export const NOTICE_SOURCES = ["teams", "batista", "notebook", "other"] as const;
export const noticeSourceSchema = z.enum(NOTICE_SOURCES);
export const SOURCE_LABELS = {
  teams: "Microsoft Teams",
  batista: "Batista ID",
  notebook: "Agenda ou caderno",
  other: "Outra origem",
};
export const DATE_ORIGIN_LABELS = {
  unspecified: "Prazo não informado",
  school: "Informado no original",
  relative: "Calculado a partir do original",
  family: "Planejado pela família",
};

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
  }, "Data inválida");
const safeUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use um endereço https sem credenciais");

export const parseNoticeSchema = z
  .object({
    profileId: z.string().uuid(),
    source: noticeSourceSchema,
    sourceUrl: safeUrl.nullable().default(null),
    publishedAt: dateSchema.nullable().default(null),
    text: z.string().trim().max(16000).default(""),
    attachment: z
      .object({
        name: z.string().trim().min(1).max(180),
        dataUrl: z
          .string()
          .max(7_100_000)
          .regex(/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/),
        pages: z.array(z.number().int().min(1).max(500)).min(1).max(3).optional(),
      })
      .nullable()
      .default(null),
  })
  .refine((v) => v.text.length > 0 || v.attachment, "Cole um recado ou escolha um anexo");

export const extractedActionSchema = z.object({
  type: activityTypeSchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().max(3000).nullable(),
  dueAt: dateSchema.nullable(),
  dateOrigin: z.enum(["unspecified", "school", "relative"]),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  location: z.string().max(300).nullable(),
  sourceExcerpt: z.string().max(1500).nullable(),
});
export const noticeExtractionSchema = z.object({
  actions: z.array(extractedActionSchema).max(30),
  warnings: z.array(z.string().max(400)).max(10),
  publicationReference: z
    .object({
      date: dateSchema,
      sourceExcerpt: z.string().trim().min(1).max(1500),
    })
    .nullable()
    .optional(),
});
export type NoticeExtraction = z.infer<typeof noticeExtractionSchema>;
// Older stored drafts may lack this field; structured generation requires
// every property to be present, using null when no publication is known.
export const noticeGenerationSchema = noticeExtractionSchema.required({
  publicationReference: true,
});

export const actionFieldsSchema = extractedActionSchema
  .extend({
    profileId: z.string().uuid(),
    dateOrigin: z.enum(["unspecified", "school", "relative", "family"]),
    assignedToUserId: z.string().max(128).nullable().default(null),
    reminderAt: z.string().datetime({ offset: true }).nullable().default(null),
    recurrence: z.enum(["none", "weekly"]).default("none"),
  })
  .superRefine((v, ctx) => {
    if ((v.dueAt === null) !== (v.dateOrigin === "unspecified"))
      ctx.addIssue({
        code: "custom",
        path: ["dateOrigin"],
        message: "Informe a origem do prazo ou deixe a data vazia",
      });
    if (!v.dueAt && (v.time || v.reminderAt || v.recurrence !== "none"))
      ctx.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Defina uma data para usar horário, lembrete ou repetição",
      });
  });
export type NoticeActionInput = z.infer<typeof actionFieldsSchema>;
export const confirmNoticeSchema = z.object({
  noticeId: z.string().uuid().nullable(),
  actions: z.array(actionFieldsSchema).min(1).max(30),
  allowDuplicates: z.boolean().default(false),
  sourceProfileIds: z.array(z.string().uuid()).min(1).max(10).nullable().optional(),
  resolutions: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ index: z.number().int().min(0).max(29), kind: z.literal("separate") }),
        z.object({
          index: z.number().int().min(0).max(29),
          kind: z.literal("replace"),
          actionId: z.string().uuid(),
          version: z.number().int().positive(),
        }),
      ]),
    )
    .max(30)
    .optional(),
});
export const updateNoticeActionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  action: actionFieldsSchema,
});
export const statusNoticeActionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["pending", "done", "canceled"]),
});
