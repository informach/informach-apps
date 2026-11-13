import { ehErroDoRecreio } from "@informach/recreio";
import * as Sentry from "@sentry/node";

/** Só classificadores fixos chegam ao provedor; nada da requisição ou do mundo. */
export function iniciarObservabilidade(dsn: string | undefined, commit: string | undefined): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: commit,
    sendDefaultPii: false,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    beforeSend: (evento) => ({
      type: evento.type,
      event_id: evento.event_id,
      timestamp: evento.timestamp,
      release: commit,
      platform: "node",
      level: "error",
      message: "morada.server_failure",
      tags: {
        app: "morada-server",
        operation: evento.tags?.operation,
        code: evento.tags?.code,
      },
    }),
  });
}

export function registrarFalha(erro: unknown, operacao: "rede" | "encerrar" | "iniciar"): void {
  Sentry.captureMessage("morada.server_failure", {
    level: "error",
    tags: { operation: operacao, code: ehErroDoRecreio(erro) ? erro.codigo : "INTERNO" },
  });
}

export async function concluirObservabilidade(): Promise<void> {
  await Sentry.flush(2000);
}
