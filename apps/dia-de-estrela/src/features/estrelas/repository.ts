import "server-only";
import { randomUUID } from "node:crypto";
import { and, db, desc, eq, gt, gte, inArray, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaCompletions as completions,
  estrelaFamilies as families,
  estrelaLedger as ledger,
  estrelaRedemptions as redemptions,
  estrelaReminderStates as reminders,
  estrelaTasks as tasks,
} from "@informach/db/schema";
import { aconteceNo } from "@/domain/rotina";
import { assertAllowed } from "@/lib/errors";
import type { Tx } from "../familia/repository";

export type CompletionRow = typeof completions.$inferSelect;

/** Trava a criança: saldo, pedidos e conclusões dela mudam um de cada vez. */
async function lockChild(tx: Tx, ownerId: string, childId: string) {
  const [child] = await tx
    .select({ id: children.id, name: children.name })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.userId, ownerId)))
    .for("update");
  assertAllowed(child, "NOT_FOUND", "Criança não encontrada.");
  return child;
}

async function balanceIn(tx: Tx | typeof db, childId: string) {
  const [row] = await tx
    .select({
      saldo: sql<number>`coalesce(sum(${ledger.stars}), 0)::int`,
    })
    .from(ledger)
    .where(eq(ledger.childId, childId));
  const [guardadas] = await tx
    .select({ total: sql<number>`coalesce(sum(${redemptions.stars}), 0)::int` })
    .from(redemptions)
    .where(and(eq(redemptions.childId, childId), eq(redemptions.status, "pending")));
  return { saldo: row?.saldo ?? 0, guardadas: guardadas?.total ?? 0 };
}

/** Saldo e estrelas guardadas em pedidos, de várias crianças de uma vez. */
export async function balances(childIds: string[]) {
  if (!childIds.length) return new Map<string, { saldo: number; guardadas: number }>();
  const saldos = await db
    .select({ childId: ledger.childId, saldo: sql<number>`sum(${ledger.stars})::int` })
    .from(ledger)
    .where(inArray(ledger.childId, childIds))
    .groupBy(ledger.childId);
  const pedidos = await db
    .select({ childId: redemptions.childId, total: sql<number>`sum(${redemptions.stars})::int` })
    .from(redemptions)
    .where(and(inArray(redemptions.childId, childIds), eq(redemptions.status, "pending")))
    .groupBy(redemptions.childId);
  return new Map(
    childIds.map((id) => [
      id,
      {
        saldo: saldos.find((s) => s.childId === id)?.saldo ?? 0,
        guardadas: pedidos.find((p) => p.childId === id)?.total ?? 0,
      },
    ]),
  );
}

/** Conclusões e estado dos lembretes de um dia, para as crianças pedidas. */
export async function dayState(childIds: string[], date: string) {
  if (!childIds.length) return { completions: [], reminders: [] };
  const [done, states] = await Promise.all([
    db
      .select()
      .from(completions)
      .where(and(inArray(completions.childId, childIds), eq(completions.date, date))),
    db
      .select()
      .from(reminders)
      .where(and(inArray(reminders.childId, childIds), eq(reminders.date, date))),
  ]);
  return { completions: done, reminders: states };
}

export type CompleteInput = {
  ownerId: string;
  childId: string;
  taskId: string;
  date: string;
  diaDaSemana: number;
  markedBy: "child" | "adult";
};

/**
 * Marca a tarefa feita no dia local. Pela criança, uma tarefa com "precisa do
 * ok" fica pendente; pelo adulto, já entra aprovada. Se o dia ficou completo,
 * o baú abre (uma vez por dia, idempotente pela chave da origem).
 */
export async function completeTask(input: CompleteInput) {
  return db.transaction(async (tx) => {
    await lockChild(tx, input.ownerId, input.childId);
    const [task] = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        stars: tasks.stars,
        days: tasks.days,
        requiresApproval: tasks.requiresApproval,
      })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.childId, input.childId)));
    assertAllowed(task, "NOT_FOUND", "Tarefa não encontrada.");
    assertAllowed(
      aconteceNo(task.days, input.diaDaSemana),
      "NOT_TODAY",
      "Essa tarefa não é de hoje.",
    );
    const pending = input.markedBy === "child" && task.requiresApproval;
    const [completion] = await tx
      .insert(completions)
      .values({
        childId: input.childId,
        taskId: task.id,
        date: input.date,
        markedBy: input.markedBy,
        status: pending ? "pending" : "approved",
        stars: task.stars,
        approvedAt: pending ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    assertAllowed(completion, "ALREADY_DONE", "Essa tarefa já foi marcada hoje.");
    if (!pending)
      await tx.insert(ledger).values({
        childId: input.childId,
        kind: "task",
        stars: task.stars,
        label: task.title,
        sourceKey: `task:${completion.id}`,
      });
    const chest = await openChestIfDone(
      tx,
      input.ownerId,
      input.childId,
      input.date,
      input.diaDaSemana,
    );
    return { completion, pending, stars: task.stars, chest };
  });
}

/**
 * O baú do dia abre quando todas as tarefas do dia foram marcadas (inclusive
 * as que esperam o ok). Nunca fecha de novo nem tira estrelas.
 */
async function openChestIfDone(
  tx: Tx,
  ownerId: string,
  childId: string,
  date: string,
  diaDaSemana: number,
) {
  const todas = await tx
    .select({ id: tasks.id, days: tasks.days })
    .from(tasks)
    .where(eq(tasks.childId, childId));
  const doDia = todas.filter((t) => aconteceNo(t.days, diaDaSemana));
  if (!doDia.length) return null;
  const feitas = await tx
    .select({ taskId: completions.taskId })
    .from(completions)
    .where(and(eq(completions.childId, childId), eq(completions.date, date)));
  const marcadas = new Set(feitas.map((f) => f.taskId));
  if (!doDia.every((t) => marcadas.has(t.id))) return null;
  const [family] = await tx
    .select({ chestBonus: families.chestBonus })
    .from(families)
    .where(eq(families.userId, ownerId));
  const bonus = family?.chestBonus ?? 0;
  if (bonus <= 0) return { stars: 0 };
  const [row] = await tx
    .insert(ledger)
    .values({
      childId,
      kind: "chest",
      stars: bonus,
      label: "Baú do dia",
      sourceKey: `chest:${childId}:${date}`,
    })
    .onConflictDoNothing()
    .returning({ id: ledger.id });
  return row ? { stars: bonus } : null;
}

/** Conclusão de uma criança da família, com o título da tarefa. */
async function completionOf(tx: Tx, ownerId: string, completionId: string) {
  const [row] = await tx
    .select({
      id: completions.id,
      childId: completions.childId,
      status: completions.status,
      stars: completions.stars,
      title: tasks.title,
    })
    .from(completions)
    .innerJoin(children, eq(completions.childId, children.id))
    .innerJoin(tasks, eq(completions.taskId, tasks.id))
    .where(and(eq(completions.id, completionId), eq(children.userId, ownerId)));
  assertAllowed(row, "NOT_FOUND", "Esta tarefa não está mais marcada.");
  return row;
}

export async function approveCompletion(ownerId: string, completionId: string) {
  return db.transaction(async (tx) => {
    const c = await completionOf(tx, ownerId, completionId);
    await lockChild(tx, ownerId, c.childId);
    assertAllowed(c.status === "pending", "ALREADY", "Essa tarefa já foi aprovada.");
    await tx
      .update(completions)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(completions.id, c.id));
    await tx
      .insert(ledger)
      .values({
        childId: c.childId,
        kind: "task",
        stars: c.stars,
        label: c.title,
        sourceKey: `task:${c.id}`,
      })
      .onConflictDoNothing();
    return c;
  });
}

/**
 * Desfaz uma conclusão (pendente ou aprovada) sem deixar linha de castigo no
 * histórico: a conclusão e as estrelas dela saem. Recusa se o saldo ficaria
 * menor do que já foi trocado na loja.
 */
export async function undoCompletion(ownerId: string, completionId: string) {
  return db.transaction(async (tx) => {
    const c = await completionOf(tx, ownerId, completionId);
    await lockChild(tx, ownerId, c.childId);
    if (c.status === "approved") {
      const { saldo, guardadas } = await balanceIn(tx, c.childId);
      assertAllowed(
        saldo - c.stars >= guardadas && saldo - c.stars >= 0,
        "BALANCE",
        "Essas estrelas já foram usadas na loja. Não dá para desfazer esta tarefa.",
      );
      await tx.delete(ledger).where(eq(ledger.sourceKey, `task:${c.id}`));
    }
    await tx.delete(completions).where(eq(completions.id, c.id));
    return c;
  });
}

export async function giveBonus(ownerId: string, childId: string, stars: number, label: string) {
  return db.transaction(async (tx) => {
    await lockChild(tx, ownerId, childId);
    await tx.insert(ledger).values({
      childId,
      kind: "bonus",
      stars,
      label,
      sourceKey: `bonus:${randomUUID()}`,
    });
  });
}

/** Conclusões esperando o ok dos pais, de todas as crianças da família. */
export async function pendingApprovals(ownerId: string) {
  return db
    .select({
      id: completions.id,
      childId: completions.childId,
      taskId: completions.taskId,
      date: completions.date,
      stars: completions.stars,
      completedAt: completions.completedAt,
      title: tasks.title,
      icon: tasks.icon,
    })
    .from(completions)
    .innerJoin(children, eq(completions.childId, children.id))
    .innerJoin(tasks, eq(completions.taskId, tasks.id))
    .where(and(eq(children.userId, ownerId), eq(completions.status, "pending")))
    .orderBy(completions.completedAt);
}

export async function history(childId: string, limit = 12) {
  return db
    .select({
      id: ledger.id,
      kind: ledger.kind,
      stars: ledger.stars,
      label: ledger.label,
      createdAt: ledger.createdAt,
    })
    .from(ledger)
    .where(eq(ledger.childId, childId))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);
}

/** Estrelas ganhas (tarefas, bônus, baú) nos últimos 7 dias, para prever a meta. */
export async function earnedLastWeek(childId: string, now = new Date()) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${ledger.stars}), 0)::int` })
    .from(ledger)
    .where(
      and(
        eq(ledger.childId, childId),
        gt(ledger.stars, 0),
        gte(ledger.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
      ),
    );
  return row?.total ?? 0;
}

export { balanceIn, lockChild };
