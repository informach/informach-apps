import "server-only";
import { relogioDa } from "@/domain/relogio";
import { type RegistroLembrete, type Tarefa, tarefasDoDia } from "@/domain/rotina";
import { canCreateCustomRewards } from "@/features/acesso/policy";
import { getAccess } from "@/features/billing/service";
import { balances, dayState, earnedLastWeek, history } from "@/features/estrelas/repository";
import { allowedChildIds } from "@/features/familia/acesso-criancas";
import { getFamily, listChildren } from "@/features/familia/repository";
import { childRedemptions, goalsOf, listRewards } from "@/features/loja/repository";
import { listTasks } from "@/features/rotina/repository";
import { AppError } from "@/lib/errors";

/** A criança, conferida contra a família e o plano. */
export async function childOfDevice(ownerId: string, childId: string) {
  const [kids, access, family] = await Promise.all([
    listChildren(ownerId),
    getAccess(ownerId),
    getFamily(ownerId),
  ]);
  const allowed = new Set(allowedChildIds(kids, access.childLimit));
  const child = kids.find((k) => k.id === childId);
  if (!child || !family) throw new AppError("NOT_FOUND", "Criança não encontrada.");
  return { child, family, allowed: allowed.has(child.id), access };
}

export type DiaDaCrianca = Awaited<ReturnType<typeof childDay>>;

/**
 * Tudo o que a tela "Hoje" precisa: tarefas do dia no fuso da casa, o que já
 * foi feito, o estado dos lembretes, as estrelas e o baú.
 */
export async function childDay(ownerId: string, childId: string, now = Date.now()) {
  const { child, family, allowed } = await childOfDevice(ownerId, childId);
  const relogio = relogioDa(now, family.timezone);
  const todas = await listTasks(ownerId, [childId]);
  const tarefas = tarefasDoDia(todas, relogio.diaDaSemana);
  const [{ completions, reminders }, saldos] = await Promise.all([
    dayState([childId], relogio.data),
    balances([childId]),
  ]);
  const registros: Record<string, RegistroLembrete> = Object.fromEntries(
    reminders.map((r) => [
      r.taskId,
      {
        warnedAt: r.warnedAt?.getTime() ?? null,
        dueCount: r.dueCount,
        lastDueAt: r.lastDueAt?.getTime() ?? null,
        snoozeUntil: r.snoozeUntil?.getTime() ?? null,
        nudgeAt: r.nudgeAt?.getTime() ?? null,
      },
    ]),
  );
  const saldo = saldos.get(childId) ?? { saldo: 0, guardadas: 0 };
  return {
    child: { id: child.id, name: child.name, color: child.color },
    allowed,
    relogio,
    timezone: family.timezone,
    ajustes: {
      warnBefore: family.warnBefore,
      repeatEvery: family.repeatEvery,
      alertAfter: family.alertAfter,
      sound: family.sound,
      voice: family.voice,
      calm: family.calm,
      chestBonus: family.chestBonus,
      starsPerReal: family.starsPerReal,
    },
    tarefas: tarefas.map(
      (t) =>
        ({
          id: t.id,
          title: t.title,
          icon: t.icon,
          time: t.time,
          days: t.days,
          durationMin: t.durationMin,
          stars: t.stars,
          steps: t.steps,
          needs: t.needs,
          thenText: t.thenText,
          detail: t.detail,
          remind: t.remind,
          requiresApproval: t.requiresApproval,
          hasVoice: t.hasVoice,
        }) satisfies Tarefa & { hasVoice: boolean },
    ),
    feitas: completions.map((c) => ({ taskId: c.taskId, status: c.status, stars: c.stars })),
    registros,
    saldo: saldo.saldo,
    guardadas: saldo.guardadas,
  };
}

/** O cofrinho: saldo, meta, histórico e pedidos em aberto. */
export async function childPiggy(ownerId: string, childId: string, now = Date.now()) {
  const { child, family, access } = await childOfDevice(ownerId, childId);
  const [saldos, goals, hist, semana, pedidos, rewards] = await Promise.all([
    balances([childId]),
    goalsOf([childId]),
    history(childId, 12),
    earnedLastWeek(childId, new Date(now)),
    childRedemptions(childId),
    listRewards(ownerId),
  ]);
  const saldo = saldos.get(childId) ?? { saldo: 0, guardadas: 0 };
  return {
    child: { id: child.id, name: child.name, color: child.color },
    starsPerReal: family.starsPerReal,
    calm: family.calm,
    sound: family.sound,
    paid: access.paid,
    saldo: saldo.saldo,
    guardadas: saldo.guardadas,
    goal: goals[0] ?? null,
    history: hist,
    earnedLastWeek: semana,
    pending: pedidos,
    // Itens próprios só aparecem enquanto o plano os inclui.
    rewards: rewards.filter(
      (r) =>
        r.kind === "money" ||
        canCreateCustomRewards({ ...access, tier: access.paid ? "family" : "free" }),
    ),
  };
}
