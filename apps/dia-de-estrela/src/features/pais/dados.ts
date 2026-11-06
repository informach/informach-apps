import "server-only";
import { relogioDa } from "@/domain/relogio";
import { tarefasDoDia, visaoDoDia } from "@/domain/rotina";
import { activeDeviceChildren, listDevices } from "@/features/aparelho/repository";
import { balances, dayState, pendingApprovals } from "@/features/estrelas/repository";
import type { ChildView } from "@/features/familia/view";
import { openAlerts } from "@/features/lembretes/repository";
import { goalsOf, listRewards, pendingRedemptions } from "@/features/loja/repository";
import { listTasks } from "@/features/rotina/repository";

/** O Início dos pais: alertas, o que espera aprovação ou pagamento e o dia de cada criança. */
export async function parentHome(
  ownerId: string,
  timezone: string,
  children: ChildView[],
  now = Date.now(),
) {
  const relogio = relogioDa(now, timezone);
  const ativos = children.filter((c) => c.allowed);
  const ids = ativos.map((c) => c.id);
  const [tarefas, estado, saldos, alertas, aprovacoes, pedidos, aparelhos] = await Promise.all([
    listTasks(ownerId, ids),
    dayState(ids, relogio.data),
    balances(ids),
    openAlerts(ownerId, relogio.data),
    pendingApprovals(ownerId),
    pendingRedemptions(ownerId),
    activeDeviceChildren(ids),
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
  return {
    relogio,
    criancas,
    alertas: alertas
      .filter((a) => !a.snoozeUntil || new Date(a.snoozeUntil).getTime() <= now)
      .map((a) => ({ ...a, childName: nome.get(a.childId) ?? "" })),
    adiados: alertas.filter((a) => a.snoozeUntil && new Date(a.snoozeUntil).getTime() > now).length,
    aprovacoes: aprovacoes.map((a) => ({ ...a, childName: nome.get(a.childId) ?? "" })),
    pedidos: pedidos.map((p) => ({ ...p, childName: nome.get(p.childId) ?? "" })),
  };
}

export async function parentPiggy(ownerId: string, children: ChildView[]) {
  const ids = children.map((c) => c.id);
  const [saldos, goals, rewards] = await Promise.all([
    balances(ids),
    goalsOf(ids),
    listRewards(ownerId),
  ]);
  return {
    criancas: children.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      allowed: c.allowed,
      saldo: saldos.get(c.id)?.saldo ?? 0,
      guardadas: saldos.get(c.id)?.guardadas ?? 0,
      goal: goals.find((g) => g.childId === c.id) ?? null,
    })),
    rewards,
  };
}

export { listDevices };
