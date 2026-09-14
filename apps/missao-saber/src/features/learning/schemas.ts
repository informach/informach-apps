import { z } from "zod";
import { modeSchema } from "../content/types";

export const profileSchema = z.object({
  nickname: z.string().trim().min(2).max(24),
  grade: z.coerce.number().refine((n) => n === 6 || n === 7),
  avatar: z.enum(["cometa", "folha", "estrela", "foguete", "lua", "raio", "onda", "bussola"]),
  courseId: z.string().max(40),
  consent: z.literal(true),
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
