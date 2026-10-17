import type { DesktopStatus, DesktopStatusCause } from "@informach/edi-desktop/contracts";

/** The next step the Hub offers for the current access state. */
export type AccessAction = "connect" | "subscription" | "devices" | "update" | "retry";

export type AccessCopy = {
  tone: "ok" | "offline" | "waiting" | "blocked" | "disconnected";
  /** Short label for the rail card. */
  title: string;
  /** Heading of the panel above the tools while access is restricted. */
  heading: string;
  detail: string;
  /** Main action of the panel; null while licensed or waiting. */
  action: AccessAction | null;
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

type RestrictedCopy = Pick<AccessCopy, "tone" | "title" | "heading"> & { action: AccessAction };

const reconnect: RestrictedCopy = {
  tone: "disconnected",
  title: "Conecte de novo",
  heading: "Conecte sua conta de novo para continuar.",
  action: "connect",
};

/** One entry per cause the controller reports, so a new cause fails the typecheck here. */
const RESTRICTED: Record<DesktopStatusCause, RestrictedCopy> = {
  signed_out: {
    tone: "disconnected",
    title: "Conta não conectada",
    heading: "Conecte sua conta para abrir as ferramentas.",
    action: "connect",
  },
  offline: {
    tone: "offline",
    title: "Sem internet",
    heading: "Não deu para validar o acesso sem internet.",
    action: "retry",
  },
  expired: {
    tone: "offline",
    title: "Validação vencida",
    heading: "A validação deste computador venceu.",
    action: "retry",
  },
  unavailable: {
    tone: "blocked",
    title: "Acesso indisponível",
    heading: "Não foi possível ler a sessão guardada neste computador.",
    action: "retry",
  },
  update_required: {
    tone: "blocked",
    title: "Atualização necessária",
    heading: "Atualize o Edi Hub para continuar.",
    action: "update",
  },
  subscription_required: {
    tone: "blocked",
    title: "Sem assinatura ativa",
    heading: "Esta conta ainda não tem a assinatura da suíte.",
    action: "subscription",
  },
  payment_required: {
    tone: "blocked",
    title: "Pagamento pendente",
    heading: "O último pagamento não foi confirmado.",
    action: "subscription",
  },
  suspended: {
    tone: "blocked",
    title: "Acesso suspenso",
    heading: "O acesso desta conta está suspenso.",
    action: "subscription",
  },
  device_limit: {
    tone: "blocked",
    title: "Limite de computadores",
    heading: "Esta conta já está em todos os computadores do plano.",
    action: "devices",
  },
  revalidate: reconnect,
  connect_failed: reconnect,
  device_revoked: reconnect,
  session_revoked: reconnect,
  invalid_proof: reconnect,
};

/** Plain-language account state for the Hub, derived only from the desktop status. */
export function describeAccess(status: DesktopStatus | null, timeZone?: string): AccessCopy {
  if (!status)
    return {
      tone: "waiting",
      title: "Verificando o acesso",
      heading: "Verificando o acesso",
      detail: "",
      action: null,
    };
  if (status.state === "licensed") {
    const until = status.expiresAt ? formatUntil(status.expiresAt, timeZone) : null;
    return status.offline
      ? {
          tone: "offline",
          title: "Usando sem internet",
          heading: "Usando sem internet",
          detail: until
            ? `Liberado até ${until}. Conecte-se antes disso para renovar.`
            : status.reason,
          action: null,
        }
      : {
          tone: "ok",
          title: "Assinatura ativa",
          heading: "Assinatura ativa",
          detail: until ? `Funciona sem internet até ${until}.` : status.reason,
          action: null,
        };
  }
  if (status.state === "connecting")
    return {
      tone: "waiting",
      title: "Esperando autorização",
      heading: "Vamos conectar sua conta.",
      detail: "Confira o código no navegador e autorize este computador.",
      action: null,
    };
  return { ...RESTRICTED[status.cause ?? "signed_out"], detail: status.reason };
}

/** Buttons of the panel shown while access is restricted. */
export type RestrictedPanel = {
  primary: AccessAction;
  /** Connecting is always offered: it is also how to switch to another account. */
  connectLabel: "Conectar minha conta" | "Conectar outra conta";
  retry: boolean;
  signOut: boolean;
};

export function restrictedPanel(copy: AccessCopy, hasSession: boolean): RestrictedPanel {
  const primary = copy.action ?? "connect";
  return {
    primary,
    connectLabel:
      hasSession && primary !== "connect" ? "Conectar outra conta" : "Conectar minha conta",
    retry: hasSession && primary !== "retry",
    signOut: hasSession,
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
