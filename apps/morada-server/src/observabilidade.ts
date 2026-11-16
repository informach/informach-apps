import { CODIGOS_DE_ERRO } from "@informach/recreio";
import * as Sentry from "@sentry/node";
import { resumoDaFalha } from "./resumo-da-falha";

const OPERACOES = new Set(["rede", "encerrar", "iniciar"]);
const CODIGOS = new Set<string>([...CODIGOS_DE_ERRO, "INTERNO"]);
const classificador = (valor: unknown, admitidos: Set<string>, alternativa: string): string =>
  typeof valor === "string" && admitidos.has(valor) ? valor : alternativa;

/** Só classificadores fixos chegam ao provedor; nada da requisição ou do mundo. */
export function iniciarObservabilidade(
  dsn: string | undefined,
  commit: string | undefined,
  ambiente: string,
): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: commit,
    environment: ambiente,
    sendDefaultPii: false,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    beforeSend: (evento) => ({
      type: evento.type,
      event_id: evento.event_id,
      timestamp: evento.timestamp,
      release: commit,
      environment: ambiente,
      platform: "node",
      level: "error",
      message: "morada.server_failure",
      tags: {
        app: "morada-server",
        operation: classificador(evento.tags?.operation, OPERACOES, "desconhecida"),
        code: classificador(evento.tags?.code, CODIGOS, "INTERNO"),
      },
    }),
  });
}

export function registrarFalha(erro: unknown, operacao: "rede" | "encerrar" | "iniciar"): void {
  Sentry.captureMessage("morada.server_failure", {
    level: "error",
    tags: { operation: operacao, code: resumoDaFalha(erro).codigo },
  });
}

export async function concluirObservabilidade(): Promise<void> {
  const cliente = Sentry.getClient();
  if (!cliente) return;
  const concluido = await cliente.flush(2000);
  if (!concluido) throw new Error("O envio da observabilidade não terminou no prazo.");
}
