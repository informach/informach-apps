import type { DesktopStatus } from "@informach/edi-desktop/contracts";

export type AccessCopy = {
  tone: "ok" | "offline" | "waiting" | "blocked" | "disconnected";
  title: string;
  detail: string;
  /** What the rail offers next: connect the account, open the subscription, or nothing. */
  action: "connect" | "subscription" | null;
};

export function formatUntil(iso: string, timeZone?: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone }).format(date);
  return `${day}, às ${time}`;
}

/** Plain-language account state for the Hub, derived only from the desktop status. */
export function describeAccess(status: DesktopStatus | null, timeZone?: string): AccessCopy {
  if (!status) return { tone: "waiting", title: "Verificando o acesso", detail: "", action: null };
  if (status.state === "licensed") {
    const until = status.expiresAt ? formatUntil(status.expiresAt, timeZone) : null;
    return status.offline
      ? {
          tone: "offline",
          title: "Usando sem internet",
          detail: until
            ? `Liberado até ${until}. Conecte-se antes disso para renovar.`
            : status.reason,
          action: null,
        }
      : {
          tone: "ok",
          title: "Assinatura ativa",
          detail: until ? `Funciona sem internet até ${until}.` : status.reason,
          action: null,
        };
  }
  if (status.state === "connecting")
    return {
      tone: "waiting",
      title: "Esperando autorização",
      detail: "Confira o código no navegador e autorize este computador.",
      action: null,
    };
  return status.userId
    ? { tone: "blocked", title: "Acesso bloqueado", detail: status.reason, action: "subscription" }
    : {
        tone: "disconnected",
        title: "Conta não conectada",
        detail: status.reason,
        action: "connect",
      };
}

export function hubUpdateNotice(update: DesktopStatus["update"] | undefined) {
  if (update === "ready")
    return "Nova versão do Edi Hub baixada. Ela entra na próxima vez que o Hub fechar.";
  if (update === "downloading") return "Baixando uma nova versão do Edi Hub.";
  if (update === "error")
    return "Não foi possível verificar atualizações agora. O Hub tenta de novo sozinho.";
  return null;
}
