import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaTasks as tasks,
  estrelaTaskVoices as voices,
} from "@informach/db/schema";
import { MODELOS } from "@/domain/modelos";
import type { Tarefa } from "@/domain/rotina";
import { assertAllowed } from "@/lib/errors";
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

/** Toda leitura de tarefa passa pela família dona da criança. */
const daFamilia = (ownerId: string) =>
  sql`exists (select 1 from ${children} where ${children.id} = ${tasks.childId} and ${children.userId} = ${ownerId})`;

export async function listTasks(ownerId: string, childIds?: string[]): Promise<TaskRow[]> {
  if (childIds && !childIds.length) return [];
  return db
    .select(taskFields)
    .from(tasks)
    .where(and(daFamilia(ownerId), childIds ? inArray(tasks.childId, childIds) : undefined))
    .orderBy(tasks.time, tasks.createdAt);
}

export async function getTask(ownerId: string, taskId: string): Promise<TaskRow | null> {
  const [row] = await db
    .select(taskFields)
    .from(tasks)
    .where(and(eq(tasks.id, taskId), daFamilia(ownerId)));
  return row ?? null;
}

async function assertChild(ownerId: string, childId: string) {
  const [child] = await db
    .select({ id: children.id })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.userId, ownerId)));
  assertAllowed(child, "NOT_FOUND", "Criança não encontrada.");
}

export async function createTask(ownerId: string, childId: string, input: TaskInput) {
  await assertChild(ownerId, childId);
  const [row] = await db
    .insert(tasks)
    .values({ ...input, childId })
    .returning({ id: tasks.id });
  assertAllowed(row, "TASK", "Não foi possível salvar a tarefa.");
  return row.id;
}

export async function updateTask(ownerId: string, taskId: string, input: TaskInput) {
  const rows = await db
    .update(tasks)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), daFamilia(ownerId)))
    .returning({ childId: tasks.childId });
  assertAllowed(rows[0], "NOT_FOUND", "Tarefa não encontrada.");
  return rows[0].childId;
}

export async function deleteTask(ownerId: string, taskId: string) {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), daFamilia(ownerId)))
    .returning({ id: tasks.id });
  assertAllowed(rows.length, "NOT_FOUND", "Tarefa não encontrada.");
}

export async function applyTemplate(ownerId: string, childId: string, templateId: string) {
  await assertChild(ownerId, childId);
  const modelo = MODELOS.find((m) => m.id === templateId);
  assertAllowed(modelo, "TEMPLATE", "Modelo não encontrado.");
  await db.insert(tasks).values(modelo.tasks.map((t) => ({ ...t, childId })));
  return modelo.tasks.length;
}

export async function saveVoice(
  ownerId: string,
  taskId: string,
  voice: { mime: string; data: Buffer; durationMs: number },
) {
  const task = await getTask(ownerId, taskId);
  assertAllowed(task, "NOT_FOUND", "Tarefa não encontrada.");
  await db
    .insert(voices)
    .values({ taskId, ...voice })
    .onConflictDoUpdate({
      target: voices.taskId,
      set: { ...voice, updatedAt: new Date() },
    });
}

export async function deleteVoice(ownerId: string, taskId: string) {
  const task = await getTask(ownerId, taskId);
  assertAllowed(task, "NOT_FOUND", "Tarefa não encontrada.");
  await db.delete(voices).where(eq(voices.taskId, taskId));
}

/** O áudio de uma tarefa, só para quem é da família dona dela. */
export async function readVoice(ownerId: string, taskId: string, childIds?: string[] | null) {
  if (childIds && !childIds.length) return null;
  const [row] = await db
    .select({ mime: voices.mime, data: voices.data, updatedAt: voices.updatedAt })
    .from(voices)
    .innerJoin(tasks, eq(voices.taskId, tasks.id))
    .where(
      and(
        eq(voices.taskId, taskId),
        daFamilia(ownerId),
        // Um aparelho só ouve as tarefas das crianças conectadas a ele.
        childIds ? inArray(tasks.childId, childIds) : undefined,
      ),
    );
  return row ?? null;
}
