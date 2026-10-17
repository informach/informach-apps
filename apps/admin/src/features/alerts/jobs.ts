import "server-only";
import { recordJobRun } from "@informach/db";
import { runAdminWatch, type WatchResult } from "./watch";
import { runAdminWeekly, type WeeklyResult } from "./weekly";

/** E-mail que não saiu: a passada conta como falha em Operação, mas devolve as contagens. */
class DeliveryIncomplete extends Error {
  constructor() {
    super("some e-mails were not delivered");
    this.name = "EmailDeliveryIncomplete";
  }
}

async function recorded<T>(job: string, run: () => Promise<T>, incomplete: (result: T) => boolean) {
  const outcome: { result?: T } = {};
  try {
    await recordJobRun({ app: "admin", job }, async () => {
      const result = await run();
      outcome.result = result;
      if (incomplete(result)) throw new DeliveryIncomplete();
      return result;
    });
  } catch (error) {
    if (!(error instanceof DeliveryIncomplete)) throw error;
  }
  if (outcome.result === undefined) throw new Error(`${job} produced no result`);
  return outcome.result;
}

/** As rotinas do próprio Bastidores, registradas em `ops.job_runs` como as dos apps. */
export function adminWatchJob(): Promise<WatchResult> {
  return recorded(
    "admin-watch",
    () => runAdminWatch(),
    // Aviso que não chegou a ninguém (todo destinatário bloqueado) também é falha da passada.
    (result) => result.alertsPending > 0 || result.alertsUndelivered > 0,
  );
}

export function adminWeeklyJob(): Promise<WeeklyResult> {
  return recorded(
    "admin-weekly",
    () => runAdminWeekly(),
    (result) => result.failed > 0,
  );
}
