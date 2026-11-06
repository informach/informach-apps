import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  customers,
  estrelaFamilies,
  estrelaParentAlerts,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  conferirPin,
  gerarHashDoPin,
  PIN_JANELA_MS,
  PIN_TENTATIVAS,
} from "@/features/aparelho/pin";
import {
  consumeAttempt,
  createDevice,
  createPairingCode,
  privateHash,
  readDevice,
  redeemPairingCode,
  revokeDevice,
} from "@/features/aparelho/repository";
import { getAccess } from "@/features/billing/service";
import {
  approveCompletion,
  balances,
  completeTask,
  giveBonus,
  history,
  pendingApprovals,
  undoCompletion,
} from "@/features/estrelas/repository";
import {
  completeOnboarding,
  createChild,
  listChildren,
  updateSettings,
} from "@/features/familia/repository";
import { runAlerts } from "@/features/lembretes/alertas";
import { openAlerts } from "@/features/lembretes/repository";
import {
  createReward,
  listRewards,
  requestRedemption,
  resolveRedemption,
} from "@/features/loja/repository";
import { createTask, deleteTask, getTask, listTasks } from "@/features/rotina/repository";
import { taskSchema } from "@/features/rotina/schemas";

const dono = randomUUID();
const outro = randomUUID();
const familia = randomUUID();
let customerId = "";
let subscriptionId = "";
// Quarta, 4/11/2026, 12:00 em São Paulo.
const MEIO_DIA = Date.UTC(2026, 10, 4, 15, 0);
const HOJE = "2026-11-04";
const QUARTA = 3;

const livre = { customAllowed: true };

const tarefa = (title: string, time: string, extra: Record<string, unknown> = {}) =>
  taskSchema.parse({ title, icon: "star", time, days: 0b1111111, stars: 5, ...extra });

async function usuario(id: string) {
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    name: "Integração Estrela",
    emailVerified: true,
  });
}

beforeAll(async () => {
  for (const id of [dono, outro, familia]) await usuario(id);
  // `familia` assina o plano Família.
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_estrela_${familia}`,
      subjectType: "user",
      subjectId: familia,
      app: "dia-de-estrela",
      email: `${familia}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Missing customer fixture");
  customerId = customer.id;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId,
      provider: "stripe",
      providerSubscriptionId: `sub_estrela_${familia}`,
      productId: "estrela_family_monthly",
      providerPriceId: "price_estrela_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  if (!subscription) throw new Error("Missing subscription fixture");
  subscriptionId = subscription.id;
});

afterAll(async () => {
  if (subscriptionId) await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  for (const id of [dono, outro, familia]) await db.delete(users).where(eq(users.id, id));
});

describe("planos", () => {
  it("o gratuito tem uma criança; o primeiro uso recusa a segunda", async () => {
    const access = await getAccess(dono);
    expect(access).toMatchObject({ paid: false, childLimit: 1 });
    await expect(
      completeOnboarding(
        dono,
        {
          children: [
            { name: "Lucas", color: "#1F6FD1" },
            { name: "Marina", color: "#6A49D6" },
          ],
          templateIds: [],
          pinHash: await gerarHashDoPin("2468"),
          timezone: "America/Sao_Paulo",
        },
        access.childLimit,
      ),
    ).rejects.toMatchObject({ code: "CHILD_LIMIT" });
    const ids = await completeOnboarding(
      dono,
      {
        children: [{ name: "Lucas", color: "#1F6FD1" }],
        templateIds: ["noite"],
        pinHash: await gerarHashDoPin("2468"),
        timezone: "America/Sao_Paulo",
      },
      access.childLimit,
    );
    expect(ids).toHaveLength(1);
    expect(await listTasks(dono, ids)).toHaveLength(5);
    expect(await listRewards(dono)).toHaveLength(2);
    await expect(createChild(dono, { name: "Marina", color: "#6A49D6" }, 1)).rejects.toMatchObject({
      code: "CHILD_LIMIT",
    });
  });

  it("o Família aceita até quatro, mesmo com pedidos ao mesmo tempo", async () => {
    const access = await getAccess(familia);
    expect(access).toMatchObject({ paid: true, childLimit: 4 });
    await completeOnboarding(
      familia,
      {
        children: [{ name: "Ana", color: "#15803D" }],
        templateIds: [],
        pinHash: await gerarHashDoPin("1357"),
        timezone: "America/Sao_Paulo",
      },
      4,
    );
    const r = await Promise.allSettled(
      ["B", "C", "D", "E", "F"].map((n) => createChild(familia, { name: n, color: "#C2410C" }, 4)),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect(await listChildren(familia)).toHaveLength(4);
  });
});

describe("tarefas, estrelas e baú", () => {
  let crianca = "";
  let licao = "";
  let banho = "";

  beforeAll(async () => {
    const [c] = await listChildren(dono);
    crianca = c?.id ?? "";
    licao = await createTask(dono, crianca, tarefa("Lição", "15:30", { requiresApproval: true }));
    banho = (await listTasks(dono, [crianca])).find((t) => t.title === "Tomar banho")?.id ?? "";
    await updateSettings(dono, { chestBonus: 4 });
  });

  it("marca uma vez por dia; com 'precisa do ok', as estrelas esperam a aprovação", async () => {
    const r = await completeTask({
      ownerId: dono,
      childId: crianca,
      taskId: licao,
      date: HOJE,
      diaDaSemana: QUARTA,
      markedBy: "child",
    });
    expect(r.pending).toBe(true);
    expect((await balances([crianca])).get(crianca)?.saldo).toBe(0);
    await expect(
      completeTask({
        ownerId: dono,
        childId: crianca,
        taskId: licao,
        date: HOJE,
        diaDaSemana: QUARTA,
        markedBy: "child",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_DONE" });
    const [pendente] = await pendingApprovals(dono);
    expect(pendente?.taskId).toBe(licao);
    await approveCompletion(dono, r.completion.id);
    expect((await balances([crianca])).get(crianca)?.saldo).toBe(5);
    await expect(approveCompletion(dono, r.completion.id)).rejects.toMatchObject({
      code: "ALREADY",
    });
  });

  it("o adulto marca já aprovado; desfazer não deixa linha de castigo", async () => {
    const r = await completeTask({
      ownerId: dono,
      childId: crianca,
      taskId: banho,
      date: HOJE,
      diaDaSemana: QUARTA,
      markedBy: "adult",
    });
    expect(r.pending).toBe(false);
    expect((await balances([crianca])).get(crianca)?.saldo).toBe(8);
    await undoCompletion(dono, r.completion.id);
    expect((await balances([crianca])).get(crianca)?.saldo).toBe(5);
    expect((await history(crianca)).every((h) => h.stars > 0)).toBe(true);
  });

  it("o baú abre uma vez quando todas as tarefas do dia foram marcadas", async () => {
    const todas = await listTasks(dono, [crianca]);
    let bau = 0;
    for (const t of todas) {
      const r = await completeTask({
        ownerId: dono,
        childId: crianca,
        taskId: t.id,
        date: HOJE,
        diaDaSemana: QUARTA,
        markedBy: "adult",
      }).catch(() => null);
      bau += r?.chest?.stars ?? 0;
    }
    expect(bau).toBe(4);
    expect((await history(crianca, 50)).filter((h) => h.kind === "chest")).toHaveLength(1);
  });

  it("loja: pede só com saldo livre; entregar desconta, recusar libera", async () => {
    await createReward(dono, {
      kind: "custom",
      name: "Passeio",
      icon: "trees",
      priceStars: 10_000,
    });
    const itens = await listRewards(dono);
    const cinco = itens.find((r) => r.moneyCents === 500);
    const caro = itens.find((r) => r.name === "Passeio");
    if (!cinco || !caro) throw new Error("Missing rewards");
    await expect(requestRedemption(dono, crianca, caro.id, livre)).rejects.toMatchObject({
      code: "BALANCE",
    });
    await giveBonus(dono, crianca, 50, "Bônus: teste");
    const saldo = (await balances([crianca])).get(crianca)?.saldo ?? 0;
    expect(saldo).toBeGreaterThanOrEqual(50);
    const p1 = await requestRedemption(dono, crianca, cinco.id, livre);
    expect(p1.stars).toBe(50);
    expect((await balances([crianca])).get(crianca)?.guardadas).toBe(50);
    await resolveRedemption(dono, p1.id, "declined");
    expect((await balances([crianca])).get(crianca)).toMatchObject({ saldo, guardadas: 0 });
    const p2 = await requestRedemption(dono, crianca, cinco.id, livre);
    await resolveRedemption(dono, p2.id, "delivered");
    expect((await balances([crianca])).get(crianca)).toMatchObject({
      saldo: saldo - 50,
      guardadas: 0,
    });
    await expect(resolveRedemption(dono, p2.id, "delivered")).rejects.toMatchObject({
      code: "ALREADY",
    });
  });

  it("item próprio não pode ser pedido quando o plano não inclui", async () => {
    const caro = (await listRewards(dono)).find((r) => r.name === "Passeio");
    if (!caro) throw new Error("Missing reward");
    await expect(
      requestRedemption(dono, crianca, caro.id, { customAllowed: false }),
    ).rejects.toMatchObject({ code: "PLAN" });
  });

  it("aprovar e desfazer ao mesmo tempo não deixam estrela órfã", async () => {
    const extraId = await createTask(
      dono,
      crianca,
      tarefa("Arrumar a mochila", "08:00", { requiresApproval: true }),
    );
    try {
      const antes = (await balances([crianca])).get(crianca)?.saldo ?? 0;
      const r = await completeTask({
        ownerId: dono,
        childId: crianca,
        taskId: extraId,
        date: HOJE,
        diaDaSemana: QUARTA,
        markedBy: "child",
      });
      expect(r.pending).toBe(true);
      await Promise.allSettled([
        undoCompletion(dono, r.completion.id),
        approveCompletion(dono, r.completion.id),
      ]);
      // Desfazer sempre vence no fim (aprovada ou não, ela sai com as estrelas).
      expect((await balances([crianca])).get(crianca)?.saldo).toBe(antes);
      expect((await history(crianca, 100)).some((h) => h.label === "Arrumar a mochila")).toBe(
        false,
      );
    } finally {
      await deleteTask(dono, extraId);
    }
  });

  it("dois adultos resolvendo o mesmo pedido: só uma decisão vale", async () => {
    const cinco = (await listRewards(dono)).find((r) => r.moneyCents === 500);
    if (!cinco) throw new Error("Missing reward");
    await giveBonus(dono, crianca, 50, "Bônus: corrida");
    const antes = (await balances([crianca])).get(crianca)?.saldo ?? 0;
    const p = await requestRedemption(dono, crianca, cinco.id, livre);
    const [a, b] = await Promise.allSettled([
      resolveRedemption(dono, p.id, "declined"),
      resolveRedemption(dono, p.id, "delivered"),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    const venceu = a.status === "fulfilled" ? "declined" : "delivered";
    expect((await balances([crianca])).get(crianca)).toMatchObject({
      saldo: venceu === "delivered" ? antes - 50 : antes,
      guardadas: 0,
    });
  });

  it("outra família não lê nem mexe no que não é dela", async () => {
    expect(await getTask(outro, licao)).toBeNull();
    expect(await listTasks(outro, [crianca])).toHaveLength(0);
    const [pendente] = await pendingApprovals(dono);
    if (pendente)
      await expect(approveCompletion(outro, pendente.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    await expect(createTask(outro, crianca, tarefa("Invasão", "10:00"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("aparelho e PIN", () => {
  it("o código conecta uma vez só; desconectar derruba o aparelho", async () => {
    const [c] = await listChildren(dono);
    if (!c) throw new Error("Missing child");
    const { code } = await createPairingCode(dono, { childIds: [c.id], label: "Tablet da sala" });
    const conectado = await redeemPairingCode(code);
    expect(conectado.childIds).toEqual([c.id]);
    await expect(redeemPairingCode(code)).rejects.toMatchObject({ code: "CODE" });
    expect(await readDevice(conectado.token)).not.toBeNull();
    expect(await revokeDevice(outro, conectado.device.id)).toBe(false);
    expect(await revokeDevice(dono, conectado.device.id)).toBe(true);
    expect(await readDevice(conectado.token)).toBeNull();
  });

  it("não deixa conectar criança de outra família", async () => {
    const [c] = await listChildren(dono);
    await expect(
      createDevice(outro, { childIds: [c?.id], label: "Intruso" }),
    ).rejects.toMatchObject({
      code: "CHILD",
    });
  });

  it("o PIN confere pelo hash e trava depois de cinco tentativas", async () => {
    const [f] = await db.select().from(estrelaFamilies).where(eq(estrelaFamilies.userId, dono));
    expect(await conferirPin("2468", f?.pinHash)).toBe(true);
    expect(await conferirPin("0000", f?.pinHash)).toBe(false);
    const chave = privateHash("pin", randomUUID());
    for (let i = 0; i < PIN_TENTATIVAS; i++)
      await consumeAttempt(chave, PIN_TENTATIVAS, PIN_JANELA_MS, "travado");
    await expect(
      consumeAttempt(chave, PIN_TENTATIVAS, PIN_JANELA_MS, "travado"),
    ).rejects.toMatchObject({
      code: "RATE_LIMIT",
    });
  });
});

describe("alertas aos pais", () => {
  it("cria o alerta da tarefa esquecida uma vez, só para criança com aparelho", async () => {
    const [ana] = await listChildren(familia);
    if (!ana) throw new Error("Missing child");
    const esquecida = await createTask(familia, ana.id, tarefa("Escovar", "11:30"));
    const feita = await createTask(familia, ana.id, tarefa("Café", "11:00"));
    await completeTask({
      ownerId: familia,
      childId: ana.id,
      taskId: feita,
      date: HOJE,
      diaDaSemana: QUARTA,
      markedBy: "adult",
    });
    // Sem aparelho: nenhum alerta.
    await runAlerts(MEIO_DIA);
    expect(await openAlerts(familia, HOJE)).toHaveLength(0);
    await createDevice(familia, { childIds: [ana.id], label: "Tablet da Ana" });
    const primeira = await runAlerts(MEIO_DIA);
    expect(primeira.created).toBeGreaterThanOrEqual(1);
    const alertas = await openAlerts(familia, HOJE);
    expect(alertas.map((a) => a.taskId)).toEqual([esquecida]);
    await runAlerts(MEIO_DIA + 5 * 60_000);
    const todas = await db
      .select()
      .from(estrelaParentAlerts)
      .where(eq(estrelaParentAlerts.taskId, esquecida));
    expect(todas).toHaveLength(1);
  });
});
