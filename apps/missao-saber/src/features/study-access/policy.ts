import { z } from "zod";

export const STUDY_COOKIE = "ms-study";
export const PROFILE_COOKIE = "ms-profile";
export const CODE_LIFETIME_MS = 10 * 60_000;
export const CODE_WINDOW_MS = 10 * 60_000;
export const CODE_ATTEMPTS = 10;
export const studyDeviceSchema = z.object({
  profileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length),
  label: z.string().trim().min(2).max(60),
  remember: z.boolean().default(false),
});
export type StudyDeviceInput = z.infer<typeof studyDeviceSchema>;
export type StudyIdentity = {
  deviceId: string;
  remember: boolean;
  expiresAt: Date;
  userId: string;
  profileIds: string[];
  profileId: string;
};

export function studyLifetimeMs(remember: boolean) {
  return (remember ? 30 * 24 : 12) * 60 * 60_000;
}

export function normalizeStudyCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export const studyCodeSchema = z
  .string()
  .max(30)
  .transform(normalizeStudyCode)
  .pipe(z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/));

const studyPaths = new Set([
  "/hoje",
  "/jornada",
  "/laboratorio",
  "/revisao",
  "/simulados",
  "/caderno",
  "/historico",
  "/meu-espaco",
]);
const parentPaths = new Set([
  "/familia",
  "/familia/estudantes",
  "/familia/acompanhamento",
  "/familia/conta",
  "/familia/preparar",
  "/familia/pronto",
  "/manutencao",
  "/estudar",
]);

/** Return paths are allowlisted before entering either account context. */
export function safeDestination(value: unknown, audience: "study" | "parent", fallback?: string) {
  const defaultPath = fallback ?? (audience === "study" ? "/hoje" : "/familia");
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return defaultPath;
  const url = new URL(value, "https://missao.invalid");
  if (url.origin !== "https://missao.invalid") return defaultPath;
  const study = studyPaths.has(url.pathname) || /^\/missao\/[a-f\d-]{36}$/.test(url.pathname);
  if (!(audience === "study" ? study : parentPaths.has(url.pathname) || study)) return defaultPath;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function selectedStudyProfile(profileIds: string[], selected: string | undefined) {
  return selected && profileIds.includes(selected) ? selected : profileIds[0];
}
