import "server-only";
import { relogioDa } from "@/domain/relogio";
import { aconteceNo, precisaAlertarPais } from "@/domain/rotina";
import { canUsePush } from "@/features/acesso/policy";
import { DEVICE_ONLINE_MS } from "@/features/aparelho/policy";
import { activeDeviceChildren, cleanupDeviceAccess } from "@/features/aparelho/repository";
import { getAccess } from "@/features/billing/service";
import { allowedChildIds } from "@/features/familia/acesso-criancas";
import { listChildren } from "@/features/familia/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { pushParaFamilia } from "./push";
import { cleanupReminders, familiesPage, insertAlert, tasksAndCompletions } from "./repository";

const PAGINA = 100;
const ORCAMENTO_MS = 50_000;

/**
 * Rotina de 5 em 5 minutos. Para cada família, cria o alerta "não marcou"
 * quando uma tarefa passou do horário pelo tempo de N lembretes, mesmo com o
 * tablet desligado. Só olha crianças que têm um aparelho conectado: sem
 * tablet, os pais estão marcando à mão e o alerta seria só barulho.
 *
 * Cada execução começa depois da última família que a anterior conseguiu ver
 * (`startAfter`) e dá a volta na lista até o tempo acabar. Se o orçamento
 * acabar no meio, `nextCursor` diz de onde a próxima continua; assim nenhuma
 * família fica para sempre no fim da fila. `nextCursor` nulo: a volta fechou.
 */
export async function runAlerts(now = Date.now(), startAfter: string | null = null) {
  const inicio = Date.now();
  const temTempo = () => Date.now() - inicio < ORCAMENTO_MS;
  let cursor: string | null = startAfter;
  // Primeiro trecho: depois de `startAfter` até o fim. Segundo: do começo até
  // `startAfter` (o limite fica na consulta, para valer a ordem do banco).
  let segundoTrecho = false;
  let fechou = false;
  let families = 0;
  let created = 0;
  let pushed = 0;
  while (temTempo()) {
    const page = await familiesPage(
      cursor,
      PAGINA,
      new Date(now),
      segundoTrecho ? startAfter : null,
    );
    for (const family of page) {
      if (!temTempo()) break;
      const r = await alertarFamilia(family, now);
      cursor = family.userId;
      families++;
      created += r.created;
      pushed += r.pushed;
    }
    if (!temTempo()) break;
    if (page.length < PAGINA) {
      if (startAfter && !segundoTrecho) {
        segundoTrecho = true;
        cursor = null;
        continue;
      }
      fechou = true;
      break;
    }
  }
  if (fechou) cursor = null;
  await cleanupReminders(new Date(now));
  await cleanupDeviceAccess();
  return { families, created, pushed, complete: fechou, nextCursor: cursor };
}

type FamiliaDoAlerta = Awaited<ReturnType<typeof familiesPage>>[number];

async function alertarFamilia(family: FamiliaDoAlerta, now: number) {
  let created = 0;
  let pushed = 0;
  const relogio = relogioDa(now, family.timezone);
  const [kids, access] = await Promise.all([listChildren(family.userId), getAccess(family.userId)]);
  const allowed = new Set(allowedChildIds(kids, access.childLimit));
  const devices = await activeDeviceChildren(
    kids.filter((k) => allowed.has(k.id)).map((k) => k.id),
  );
  const comAparelho = [...new Set(devices.map((d) => d.childId))];
  if (!comAparelho.length) return { created, pushed };
  const { taskRows, done } = await tasksAndCompletions(comAparelho, relogio.data);
  const feitas = new Set(done.map((d) => `${d.childId}:${d.taskId}`));
  for (const t of taskRows) {
    if (!aconteceNo(t.days, relogio.diaDaSemana)) continue;
    const feita = feitas.has(`${t.childId}:${t.id}`);
    if (!precisaAlertarPais(t, feita, family, relogio)) continue;
    const ligado = devices.some(
      (d) =>
        d.childId === t.childId && d.lastSeenAt && now - d.lastSeenAt.getTime() < DEVICE_ONLINE_MS,
    );
    const id = await insertAlert(t.childId, t.id, relogio.data, ligado);
    if (!id) continue;
    created++;
    if (
      canUsePush({
        paid: access.paid,
        tier: access.tier === "family" ? "family" : "free",
        childLimit: access.childLimit,
      })
    ) {
      const r = await pushParaFamilia(family.userId, `alerta:${id}`, "/inicio");
      pushed += r.sent;
    }
  }
  if (created) await avisarFamilia(family.userId, "alerta");
  return { created, pushed };
}
