import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import { estrelaTasks as tasks, estrelaTaskVoices as voices } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { MODELOS } from "@/domain/modelos";
import type { Tarefa } from "@/domain/rotina";
import { assertAllowed } from "@/lib/errors";
import { canRecordVoice } from "../acesso/policy";
import { estrelaAccessInTransaction } from "../billing/access-repository";
import type { EstrelaAuthority, ParentAuthority } from "../familia/authority";
import { childAccessCondition, lockChildAccess } from "../familia/scope";
import { assertParent, lockChildUse } from "../familia/use-repository";
import type { TaskInput } from "./schemas";

const taskFields = {
  id: tasks.id,
  childId: tasks.childId,
  title: tasks.title,
  icon: tasks.icon,
  time: tasks.time,
  days: tasks.days,
  durationMin: tasks.durationMin,
  stars: tasks.stars,
  steps: tasks.steps,
  needs: tasks.needs,
  thenText: tasks.thenText,
  detail: tasks.detail,
  remind: tasks.remind,
  requiresApproval: tasks.requiresApproval,
  hasVoice: sql<boolean>`exists (select 1 from ${voices} where ${voices.taskId} = ${tasks.id})`,
};
export type TaskRow = Tarefa & { childId: string; hasVoice: boolean };

/** Every task/file query includes canonical identity, membership and delegation. */
export async function listTasks(actor: EstrelaAuthority, childIds?: string[]): Promise<TaskRow[]> {
  if (childIds && !childIds.length) return [];
  return db
    .select(taskFields)
    .from(tasks)
    .where(
      and(
        childAccessCondition(actor, tasks.childId),
        childIds ? inArray(tasks.childId, childIds) : undefined,
      ),
    )
    .orderBy(tasks.time, tasks.createdAt);
}
export async function getTask(actor: EstrelaAuthority, taskId: string): Promise<TaskRow | null> {
  const [row] = await db
    .select(taskFields)
    .from(tasks)
    .where(and(eq(tasks.id, taskId), childAccessCondition(actor, tasks.childId)));
  return row ?? null;
}
async function lockedTask(
  tx: FamilyTransaction,
  actor: ParentAuthority,
  taskId: string,
  use = true,
) {
  assertParent(actor);
  const read = () =>
    tx
      .select(taskFields)
      .from(tasks)
      .where(and(eq(tasks.id, taskId), childAccessCondition(actor, tasks.childId, "write")));
  const [before] = await read();
  assertAllowed(before, "NOT_FOUND", "Tarefa não encontrada.");
  if (use) await lockChildUse(tx, actor, [before.childId]);
  else await lockChildAccess(tx, actor, [before.childId], "write");
  const [task] = await read();
  assertAllowed(task && task.childId === before.childId, "NOT_FOUND", "Tarefa não encontrada.");
  return task;
}
export async function createTask(actor: ParentAuthority, childId: string, input: TaskInput) {
  assertParent(actor);
  return db.transaction(async (tx) => {
    await lockChildUse(tx, actor, [childId]);
    const [row] = await tx
      .insert(tasks)
      .values({ ...input, childId })
      .returning({ id: tasks.id });
    assertAllowed(row, "TASK", "Não foi possível salvar a tarefa.");
    return row.id;
  });
}
export async function updateTask(actor: ParentAuthority, taskId: string, input: TaskInput) {
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, actor, taskId);
    await tx
      .update(tasks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    return task.childId;
  });
}
export async function deleteTask(actor: ParentAuthority, taskId: string) {
  return db.transaction(async (tx) => {
    await lockedTask(tx, actor, taskId, false);
    await tx.delete(tasks).where(eq(tasks.id, taskId));
  });
}
export async function applyTemplate(actor: ParentAuthority, childId: string, templateId: string) {
  assertParent(actor);
  const model = MODELOS.find((m) => m.id === templateId);
  assertAllowed(model, "TEMPLATE", "Modelo não encontrado.");
  return db.transaction(async (tx) => {
    await lockChildUse(tx, actor, [childId]);
    await tx.insert(tasks).values(model.tasks.map((t) => ({ ...t, childId })));
    return model.tasks.length;
  });
}
export async function saveVoice(
  actor: ParentAuthority,
  taskId: string,
  voice: { mime: string; data: Buffer; durationMs: number },
) {
  return db.transaction(async (tx) => {
    await lockedTask(tx, actor, taskId);
    assertAllowed(
      canRecordVoice(await estrelaAccessInTransaction(tx, actor)),
      "PLAN",
      "Gravar a própria voz precisa de acesso ao Compasso.",
    );
    await tx
      .insert(voices)
      .values({ taskId, ...voice })
      .onConflictDoUpdate({ target: voices.taskId, set: { ...voice, updatedAt: new Date() } });
  });
}
export async function deleteVoice(actor: ParentAuthority, taskId: string) {
  return db.transaction(async (tx) => {
    await lockedTask(tx, actor, taskId, false);
    await tx.delete(voices).where(eq(voices.taskId, taskId));
  });
}
export async function readVoice(actor: EstrelaAuthority, taskId: string) {
  const [row] = await db
    .select({ mime: voices.mime, data: voices.data, updatedAt: voices.updatedAt })
    .from(voices)
    .innerJoin(tasks, eq(voices.taskId, tasks.id))
    .where(and(eq(voices.taskId, taskId), childAccessCondition(actor, tasks.childId)));
  return row ?? null;
}
