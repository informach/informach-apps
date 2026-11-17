import "server-only";
import { relogioDa } from "@/domain/relogio";
import { tarefasDoDia, visaoDoDia } from "@/domain/rotina";
import { activeDeviceChildren, listDevices } from "@/features/aparelho/repository";
import { balances, dayState, pendingApprovals } from "@/features/estrelas/repository";
import type { ChildView } from "@/features/familia/view";
import { openAlerts } from "@/features/lembretes/repository";
import { goalsOf, listRewards, pendingRedemptions } from "@/features/loja/repository";
import { listTasks } from "@/features/rotina/repository";
import type { ParentAuthority } from "../familia/authority";

/** O Início dos pais: alertas, o que espera aprovação ou pagamento e o dia de cada criança. */
export async function parentHome(
  actor: ParentAuthority,
  timezone: string,
  children: ChildView[],
  now = Date.now(),
) {
  const relogio = relogioDa(now, timezone);
  const ativos = children.filter((c) => c.allowed);
  const ids = ativos.map((c) => c.id);
  const [tarefas, estado, saldos, alertas, aprovacoes, pedidos, aparelhos] = await Promise.all([
    listTasks(actor, ids),
    dayState(actor, ids, relogio.data),
    balances(actor, ids),
    openAlerts(actor, relogio.data),
    pendingApprovals(actor),
    pendingRedemptions(actor),
    activeDeviceChildren(actor, ids),
  ]);
  const criancas = ativos.map((c) => {
    const doDia = tarefasDoDia(
      tarefas.filter((t) => t.childId === c.id),
      relogio.diaDaSemana,
    );
    const feitas = new Set(
      estado.completions.filter((x) => x.childId === c.id).map((x) => x.taskId),
    );
    const visao = visaoDoDia(doDia, feitas, relogio);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      canWrite: c.canWrite,
      saldo: saldos.get(c.id)?.saldo ?? 0,
      temAparelho: aparelhos.some((a) => a.childId === c.id),
      itens: visao.itens.map((i) => ({
        taskId: i.tarefa.id,
        title: i.tarefa.title,
        icon: i.tarefa.icon,
        time: i.tarefa.time,
        estado: i.estado,
        completion: estado.completions.find((x) => x.childId === c.id && x.taskId === i.tarefa.id),
      })),
      foco: visao.foco ? { title: visao.foco.title, icon: visao.foco.icon } : null,
      focoComecou: visao.focoComecou,
      feitas: visao.feitas,
      total: doDia.length,
    };
  });
  const nome = new Map(children.map((c) => [c.id, c.name]));
  const writable = new Set(children.filter((c) => c.canWrite).map((c) => c.id));
  return {
    relogio,
    criancas,
    alertas: alertas
      .filter((a) => !a.snoozeUntil || new Date(a.snoozeUntil).getTime() <= now)
      .map((a) => ({
        ...a,
        childName: nome.get(a.childId) ?? "",
        canWrite: writable.has(a.childId),
      })),
    adiados: alertas.filter((a) => a.snoozeUntil && new Date(a.snoozeUntil).getTime() > now).length,
    aprovacoes: aprovacoes.map((a) => ({
      ...a,
      childName: nome.get(a.childId) ?? "",
      canWrite: writable.has(a.childId),
    })),
    pedidos: pedidos.map((p) => ({
      ...p,
      childName: nome.get(p.childId) ?? "",
      canWrite: writable.has(p.childId),
    })),
  };
}

export async function parentPiggy(actor: ParentAuthority, children: ChildView[]) {
  const ids = children.map((c) => c.id);
  const [saldos, goals, rewards] = await Promise.all([
    balances(actor, ids),
    goalsOf(actor, ids),
    listRewards(actor),
  ]);
  return {
    criancas: children.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      canWrite: c.canWrite,
      allowed: c.allowed,
      saldo: saldos.get(c.id)?.saldo ?? 0,
      guardadas: saldos.get(c.id)?.guardadas ?? 0,
      goal: goals.find((g) => g.childId === c.id) ?? null,
    })),
    rewards,
  };
}

export { listDevices };
