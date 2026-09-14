import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { findContentUnit } from "../content/catalog";
import { lessonSchema } from "../content/types";
import { contentHash, itemHash } from "../content/version";
import { managerIdentity, recordContentControl, reportedVersion, updateReport } from "./repository";

export async function isContentManager(userId: string) {
  const identity = await managerIdentity(userId);
  if (!identity?.verified) return false;
  return (
    env.MISSAO_CONTENT_MANAGER_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
      .includes(identity.email.toLowerCase()) ||
    env.MISSAO_CONTENT_MANAGER_IDS.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(userId)
  );
}
export async function requireContentManager(userId: string) {
  assertAllowed(await isContentManager(userId), "FORBIDDEN", "Acesso restrito à manutenção.");
}
export async function setContentAvailability(userId: string, raw: unknown) {
  await requireContentManager(userId);
  const data = z
    .object({
      lessonId: z.string().max(80),
      version: z.number().int(),
      hash: z.string().length(64),
      status: z.enum(["available", "suspended"]),
      note: z.string().trim().min(20).max(1000),
      invalidatedItemIds: z.array(z.string().max(120)).max(50).default([]),
    })
    .parse(raw);
  const lesson = findContentUnit(data.lessonId);
  assertAllowed(
    lesson && lesson.version === data.version && contentHash(lesson) === data.hash,
    "VERSION",
    "O conteúdo mudou. Reabra a versão antes de registrar a manutenção.",
  );
  const itemIds = new Set(lesson.items.map((item) => item.id));
  assertAllowed(
    data.invalidatedItemIds.every((itemId) => itemIds.has(itemId)),
    "ITEM",
    "Há uma atividade inválida para esta versão.",
  );
  assertAllowed(
    data.status === "suspended" || data.invalidatedItemIds.length === 0,
    "ITEM",
    "Reativar não pode invalidar novas atividades.",
  );
  await recordContentControl({
    lessonId: lesson.id,
    version: lesson.version,
    contentHash: data.hash,
    status: data.status,
    invalidatedItems: lesson.items
      .filter((item) => data.invalidatedItemIds.includes(item.id))
      .map((item) => ({ itemId: item.id, itemHash: itemHash(item) })),
    note: data.note,
    actorId: userId,
  });
}
export async function changeReportStatus(userId: string, raw: unknown) {
  await requireContentManager(userId);
  const data = z
    .object({
      id: z.string().uuid(),
      status: z.enum(["investigating", "resolved"]),
      note: z.string().trim().min(10).max(1000),
    })
    .parse(raw);
  const report = await updateReport(userId, data.id, data.status, data.note);
  assertAllowed(report, "NOT_FOUND", "Relato não encontrado.");
}

export async function invalidateReportedVersion(userId: string, raw: unknown) {
  await requireContentManager(userId);
  const data = z
    .object({
      reportId: z.string().uuid(),
      note: z.string().trim().min(20).max(1000),
    })
    .parse(raw);
  const context = await reportedVersion(data.reportId);
  assertAllowed(context, "NOT_FOUND", "Relato ou sessão de origem não encontrado.");
  const lesson = lessonSchema.parse(context.snapshot);
  assertAllowed(
    lesson.id === context.report.lessonId && lesson.version === context.report.version,
    "VERSION",
    "A versão congelada não corresponde ao relato.",
  );
  const item = lesson.items.find((candidate) => candidate.id === context.report.itemId);
  assertAllowed(item, "ITEM", "A atividade relatada não existe na versão congelada.");
  await recordContentControl({
    lessonId: lesson.id,
    version: lesson.version,
    contentHash: contentHash(lesson),
    status: "invalidated",
    invalidatedItems: [{ itemId: item.id, itemHash: itemHash(item) }],
    note: data.note,
    actorId: userId,
  });
}
