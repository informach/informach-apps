/**
 * Máquina de estado da vigia. A cada 5 minutos ela confere os serviços e decide,
 * por serviço, o que gravar em `ops.service_status` e se manda aviso.
 *
 * - Queda só avisa na segunda verificação seguida fora do ar, para uma resposta
 *   perdida não virar e-mail.
 * - A volta avisa uma vez, e só se a queda chegou a alguém.
 * - "Lento" conta como no ar: aparece no painel, não no e-mail, e não reinicia
 *   o "no ar desde".
 * - `alertedAt` marca que o aviso do estado atual chegou a todo mundo. Enquanto
 *   estiver vazio, a próxima verificação tenta de novo, com a mesma
 *   `messageKey` por pessoa: quem já recebeu não recebe de novo.
 * - Quando o aviso de queda chega a parte das pessoas, `detail` ganha o prefixo
 *   `reached:`; a volta é avisada mesmo que alguém tenha ficado sem a queda.
 * - Na volta, `detail` guarda `recovered:<início da queda>` até o aviso sair.
 */

export type StoredState = "up" | "slow" | "down";

export type StoredRow = {
  service: string;
  state: StoredState | string;
  since: Date;
  checkedAt: Date;
  latencyMs: number | null;
  commit: string | null;
  detail: string | null;
  alertedAt: Date | null;
};

export type CheckInput = {
  key: string;
  state: StoredState;
  latencyMs: number | null;
  commit: string | null;
  problem: string | null;
};

export type Alert =
  | { kind: "down"; service: string; downSince: Date; problem: string | null }
  | { kind: "up"; service: string; downSince: Date; upAt: Date };

export type Decision = { row: StoredRow; alert: Alert | null };

const RECOVERED = "recovered:";
const REACHED = "reached:";

/** No ar e lento são o mesmo período para o "desde": só a queda separa. */
export function isSameAvailability(a: string, b: string): boolean {
  return (a === "down") === (b === "down");
}

/** O aviso de queda chegou a pelo menos uma pessoa, mas não a todas. */
function wasReached(detail: string | null): boolean {
  return detail?.startsWith(REACHED) ?? false;
}

/** `detail` da queda depois de um envio que chegou a parte das pessoas. */
export function reachedDetail(detail: string | null): string {
  return wasReached(detail) ? (detail ?? REACHED) : `${REACHED}${detail ?? ""}`;
}

function recoveredSince(detail: string | null): Date | null {
  if (!detail?.startsWith(RECOVERED)) return null;
  const date = new Date(detail.slice(RECOVERED.length));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function decideTransition(
  previous: StoredRow | undefined,
  check: CheckInput,
  now: Date,
): Decision {
  const down = check.state === "down";
  const base = {
    service: check.key,
    checkedAt: now,
    latencyMs: check.latencyMs,
    commit: check.commit ?? previous?.commit ?? null,
  };

  if (!previous) {
    return {
      row: {
        ...base,
        state: check.state,
        since: now,
        detail: down ? check.problem : null,
        alertedAt: null,
      },
      alert: null,
    };
  }

  const wasDown = previous.state === "down";

  if (wasDown && down) {
    const row: StoredRow = {
      ...base,
      state: "down",
      since: previous.since,
      detail: wasReached(previous.detail) ? reachedDetail(check.problem) : check.problem,
      alertedAt: previous.alertedAt,
    };
    return {
      row,
      alert: previous.alertedAt
        ? null
        : { kind: "down", service: check.key, downSince: previous.since, problem: check.problem },
    };
  }

  if (wasDown && !down) {
    // Queda que não chegou a ninguém (uma verificação só, ou envio que falhou
    // para todos) volta em silêncio.
    if (!previous.alertedAt && !wasReached(previous.detail))
      return {
        row: { ...base, state: check.state, since: now, detail: null, alertedAt: null },
        alert: null,
      };
    return {
      row: {
        ...base,
        state: check.state,
        since: now,
        detail: `${RECOVERED}${previous.since.toISOString()}`,
        alertedAt: null,
      },
      alert: { kind: "up", service: check.key, downSince: previous.since, upAt: now },
    };
  }

  if (!wasDown && down) {
    return {
      row: { ...base, state: "down", since: now, detail: check.problem, alertedAt: null },
      alert: null,
    };
  }

  // No ar ou lento, antes e agora: o "desde" continua o mesmo, porque o serviço
  // não saiu do ar. A tela mostra "lento" pela verificação de agora.
  const pendingRecovery = !previous.alertedAt ? recoveredSince(previous.detail) : null;
  return {
    row: {
      ...base,
      state: check.state,
      since: previous.since,
      detail: previous.detail?.startsWith(RECOVERED) ? previous.detail : null,
      alertedAt: previous.alertedAt,
    },
    alert: pendingRecovery
      ? { kind: "up", service: check.key, downSince: pendingRecovery, upAt: previous.since }
      : null,
  };
}

/** Chave estável do aviso: a mesma queda nunca gera dois e-mails para a mesma pessoa. */
export function alertMessageKey(alert: Alert, recipientKey: string): string {
  return `admin.alert:${alert.service}:${alert.downSince.toISOString()}:${alert.kind}:${recipientKey}`;
}
