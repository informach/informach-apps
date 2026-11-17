import "server-only";
import { cleanupDeviceAccess } from "@/features/aparelho/repository";
import { avisarFamilia } from "@/features/tempo-real/bus";
import { pushParaFamilia } from "./push";
import { alertCandidates, cleanupReminders, createDueAlerts, familiesPage } from "./repository";

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
    const page = await familiesPage(cursor, PAGINA, segundoTrecho ? startAfter : null);
    for (const family of page) {
      if (!temTempo()) break;
      const r = await alertarFamilia(family, now);
      cursor = family.groupId;
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
  for (const candidate of await alertCandidates(family.groupId)) {
    const result = await createDueAlerts({ kind: "child", ...candidate }, now);
    created += result.ids.length;
    if (result.pushAllowed)
      for (const id of result.ids) {
        const delivery = await pushParaFamilia(
          family.groupId,
          candidate.childId,
          `alerta:${id}`,
          "/inicio",
        );
        pushed += delivery.sent;
      }
  }
  if (created) await avisarFamilia(family.groupId, "alerta");
  return { created, pushed };
}
