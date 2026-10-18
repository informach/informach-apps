import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import {
  agendaActivityRevisions,
  agendaIdempotentWrites,
  agendaProductEvents,
  agendaTasks,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { todayLocalIso } from "@/features/dashboard/date";
import {
  purgeExpiredIdempotentWrites,
  RECEIPT_RETENTION_DAYS,
} from "@/features/offline-queue/repository";
import { writeTaskStatusOnce } from "@/features/offline-queue/service";
import { createStudentProfile } from "@/features/students/service";

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

let owner: string;
let child: string;

async function task() {
  const [row] = await db
    .insert(agendaTasks)
    .values({
      profileId: child,
      createdByUserId: owner,
      type: "task",
      title: `Lição fictícia ${randomUUID()}`,
      dueAt: todayLocalIso(),
      dateOrigin: "school",
      fingerprint: randomUUID(),
    })
    .returning();
  if (!row) throw new Error("Task missing");
  return row;
}

beforeEach(async () => {
  owner = `queue-test-${randomUUID()}`;
  await db.insert(users).values({
    id: owner,
    name: "Adulto fictício",
    email: `${owner}@e2e.local`,
    emailVerified: true,
  });
  child = value(
    await createStudentProfile(owner, { name: "Criança fictícia", birthDate: null }),
  ).id;
});
afterEach(async () => {
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, owner));
  await db.delete(agendaIdempotentWrites).where(eq(agendaIdempotentWrites.userId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

describe("fila offline", () => {
  it("grava uma vez só, por mais vezes que o aparelho repita a chave", async () => {
    const row = await task();
    const key = randomUUID();
    const input = { key, id: row.id, version: row.version, status: "done" as const };

    const first = await writeTaskStatusOnce(owner, input);
    const second = await writeTaskStatusOnce(owner, input);
    const third = await writeTaskStatusOnce(owner, input);

    // A versão nova volta no recibo: é com ela que o card desfaz em seguida.
    expect(first).toEqual({ ok: true, value: { id: row.id, version: row.version + 1 } });
    // A repetição recebe exatamente a mesma resposta, e não um conflito de
    // versão por uma gravação que foi dela mesma.
    expect(second).toEqual(first);
    expect(third).toEqual(first);

    const [after] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, row.id));
    expect(after?.status).toBe("done");
    // Uma versão a mais, uma linha de histórico, uma conclusão contada.
    expect(after?.version).toBe(row.version + 1);
    const revisions = await db
      .select()
      .from(agendaActivityRevisions)
      .where(eq(agendaActivityRevisions.taskId, row.id));
    expect(revisions).toHaveLength(1);
    const completions = await db
      .select()
      .from(agendaProductEvents)
      .where(
        and(
          eq(agendaProductEvents.userId, owner),
          eq(agendaProductEvents.event, "action_completed"),
        ),
      );
    expect(completions).toHaveLength(1);
  });

  it("guarda também a recusa, para a retentativa receber a mesma recusa", async () => {
    const row = await task();
    const key = randomUUID();
    const stale = { key, id: row.id, version: row.version + 5, status: "done" as const };

    const first = await writeTaskStatusOnce(owner, stale);
    expect(first).toEqual({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await writeTaskStatusOnce(owner, stale)).toEqual(first);

    const [receipt] = await db
      .select()
      .from(agendaIdempotentWrites)
      .where(eq(agendaIdempotentWrites.key, key));
    expect(receipt?.result).toEqual({ ok: false, error: { code: "VERSION_CONFLICT" } });
  });

  it("recusa a mesma chave apontando para outra atividade", async () => {
    const first = await task();
    const other = await task();
    const key = randomUUID();
    await writeTaskStatusOnce(owner, {
      key,
      id: first.id,
      version: first.version,
      status: "done",
    });
    // Devolver o recibo antigo confirmaria uma gravação que nunca aconteceu.
    expect(
      await writeTaskStatusOnce(owner, {
        key,
        id: other.id,
        version: other.version,
        status: "done",
      }),
    ).toEqual({ ok: false, error: { code: "KEY_REUSED" } });
    const [untouched] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, other.id));
    expect(untouched?.status).toBe("pending");
  });

  it("não deixa a chave de uma família valer na caixa de outra", async () => {
    const row = await task();
    const key = randomUUID();
    await writeTaskStatusOnce(owner, { key, id: row.id, version: row.version, status: "done" });

    const stranger = `queue-other-${randomUUID()}`;
    await db.insert(users).values({
      id: stranger,
      name: "Outro adulto",
      email: `${stranger}@e2e.local`,
      emailVerified: true,
    });
    expect(
      await writeTaskStatusOnce(stranger, {
        key,
        id: row.id,
        version: row.version,
        status: "pending",
      }),
    ).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    await db.delete(users).where(eq(users.id, stranger));
  });

  it("conta a conclusão que chegou depois, pela fila", async () => {
    const row = await task();
    await writeTaskStatusOnce(owner, {
      key: randomUUID(),
      id: row.id,
      version: row.version,
      status: "done",
      queued: true,
    });
    const flushed = await db
      .select()
      .from(agendaProductEvents)
      .where(
        and(
          eq(agendaProductEvents.userId, owner),
          eq(agendaProductEvents.event, "offline_queue_flushed"),
        ),
      );
    expect(flushed).toHaveLength(1);
  });

  it("esquece o recibo depois da retenção, e não a atividade", async () => {
    const row = await task();
    const key = randomUUID();
    await writeTaskStatusOnce(owner, { key, id: row.id, version: row.version, status: "done" });
    await db
      .update(agendaIdempotentWrites)
      .set({ createdAt: new Date(Date.now() - (RECEIPT_RETENTION_DAYS + 1) * 86_400_000) })
      .where(eq(agendaIdempotentWrites.key, key));

    await purgeExpiredIdempotentWrites(new Date());

    expect(
      await db.select().from(agendaIdempotentWrites).where(eq(agendaIdempotentWrites.key, key)),
    ).toHaveLength(0);
    const [after] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, row.id));
    expect(after?.status).toBe("done");
  });

  it("responde pelo recibo mesmo quando a atividade não existe mais", async () => {
    const row = await task();
    const key = randomUUID();
    const first = await writeTaskStatusOnce(owner, {
      key,
      id: row.id,
      version: row.version,
      status: "done",
    });
    // O recibo não tem chave estrangeira para a atividade justamente para
    // sobreviver a ela. Procurar a atividade primeiro tornaria essa sobrevida
    // inútil: a repetição ouviria "não encontrado" em vez da resposta que já
    // tinha recebido.
    await db.delete(agendaTasks).where(eq(agendaTasks.id, row.id));
    expect(
      await writeTaskStatusOnce(owner, { key, id: row.id, version: row.version, status: "done" }),
    ).toEqual(first);
  });

  it("conserta um recibo ilegível em vez de desligar a idempotência daquela chave", async () => {
    const row = await task();
    const key = randomUUID();
    await writeTaskStatusOnce(owner, { key, id: row.id, version: row.version, status: "done" });
    // Um recibo gravado por outra versão do app, que o schema atual não lê.
    await db
      .update(agendaIdempotentWrites)
      .set({ result: { forma: "de outro tempo" } })
      .where(eq(agendaIdempotentWrites.key, key));

    const repaired = await writeTaskStatusOnce(owner, {
      key,
      id: row.id,
      version: row.version,
      status: "done",
    });
    // A gravação já aconteceu, então a regravação encontra a versão nova e
    // recusa — mas o recibo passa a ser legível, e a chave volta a ser
    // idempotente em vez de recusar para sempre.
    expect(repaired).toEqual({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(
      await writeTaskStatusOnce(owner, { key, id: row.id, version: row.version, status: "done" }),
    ).toEqual(repaired);
  });
});
