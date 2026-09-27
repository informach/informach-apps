import { z } from "zod";
import { modeSchema } from "../content/types";

const gradeSchema = z.coerce.number().int().min(1).max(12);
/** "AAAA-MM": só mês e ano de nascimento, nunca o dia. */
const birthMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= 2000 && year <= 2100;
  })
  .nullable()
  .optional();
const avatarSchema = z.enum([
  "cometa",
  "folha",
  "estrela",
  "foguete",
  "lua",
  "raio",
  "onda",
  "bussola",
]);
export const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(24),
  grade: gradeSchema,
  birthMonth: birthMonthSchema,
  avatar: avatarSchema,
  courseId: z.string().max(40),
  consent: z.literal(true),
});
export const updateProfileSchema = z.object({
  profileId: z.string().uuid(),
  nickname: z.string().trim().min(2).max(24),
  grade: gradeSchema,
  birthMonth: birthMonthSchema,
  avatar: avatarSchema,
  courseId: z.string().max(40),
  /** Obrigatório quando o mês de nascimento é informado pela primeira vez. */
  birthConsent: z.boolean().optional(),
});
export const startSchema = z.object({
  profileId: z.string().uuid(),
  lessonId: z.string().min(1).max(80),
  mode: modeSchema,
  requestKey: z.string().uuid(),
});
export const answerSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().max(100),
  answer: z.string().min(1).max(2000),
  requestKey: z.string().uuid(),
});
export const hintSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().max(100),
  level: z.number().int().min(1).max(3),
});
export const noteSchema = z.object({
  profileId: z.string().uuid(),
  text: z.string().trim().min(3).max(1000),
});
export const reportSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string().max(100),
  category: z.enum(["not_understood", "possible_error", "figure_issue", "app_difficulty"]),
  detail: z.string().trim().max(1000),
  requestKey: z.string().uuid(),
});
