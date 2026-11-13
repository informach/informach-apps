import "server-only";
import { relogioDa } from "@/domain/relogio";
import { type RegistroLembrete, type Tarefa, tarefasDoDia } from "@/domain/rotina";
import { canCreateCustomRewards } from "@/features/acesso/policy";
import { balances, dayState, earnedLastWeek, history } from "@/features/estrelas/repository";
import { childRedemptions, goalsOf, listRewards } from "@/features/loja/repository";
import { listTasks } from "@/features/rotina/repository";
import { AppError } from "@/lib/errors";
import type { ChildAuthority } from "../familia/authority";
import { familySnapshot } from "../familia/repository";

/** Selected child scope is revalidated in each domain query. */
export async function childOfDevice(actor: ChildAuthority, childId: string) {
  const view = await familySnapshot(actor);
  const child = view.children.find((c) => c.id === childId);
  if (!child || !view.family) throw new AppError("NOT_FOUND", "Criança não encontrada.");
  return { child, family: view.family, allowed: child.allowed, access: view.access };
}

export type DiaDaCrianca = Awaited<ReturnType<typeof childDay>>;

/**
 * Tudo o que a tela "Hoje" precisa: tarefas do dia no fuso da casa, o que já
 * foi feito, o estado dos lembretes, as estrelas e o baú.
 */
export async function childDay(actor: ChildAuthority, childId: string, now = Date.now()) {
  const { child, family, allowed } = await childOfDevice(actor, childId);
  const relogio = relogioDa(now, family.timezone);
  const todas = await listTasks(actor, [childId]);
  const tarefas = tarefasDoDia(todas, relogio.diaDaSemana);
  const [{ completions, reminders }, saldos] = await Promise.all([
    dayState(actor, [childId], relogio.data),
    balances(actor, [childId]),
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
export async function childPiggy(actor: ChildAuthority, childId: string, now = Date.now()) {
  const { child, family, access } = await childOfDevice(actor, childId);
  const [saldos, goals, hist, semana, pedidos, rewards] = await Promise.all([
    balances(actor, [childId]),
    goalsOf(actor, [childId]),
    history(actor, childId, 12),
    earnedLastWeek(actor, childId, new Date(now)),
    childRedemptions(actor, childId),
    listRewards(actor),
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

export async function childChooser(device: import("../aparelho/policy").DeviceIdentity) {
  const { childAuthority } = await import("../aparelho/server");
  const rows = await Promise.all(
    device.childIds.map(async (id) => {
      const actor = childAuthority(device, id);
      const view = await familySnapshot(actor);
      const child = view.children.find((c) => c.id === id);
      if (!child) return null;
      const values = await balances(actor, [id]);
      return {
        id,
        name: child.name,
        color: child.color,
        allowed: child.allowed,
        estrelas: values.get(id)?.saldo ?? 0,
      };
    }),
  );
  return rows.filter((row) => row !== null);
}
