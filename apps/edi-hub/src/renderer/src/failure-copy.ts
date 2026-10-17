/**
 * Errors thrown in the main process reach the page wrapped by Electron, in English
 * ("Error invoking remote method 'hub:open': Error: ..."). Only messages listed here
 * are shown as they are; anything else becomes a plain sentence for the action.
 *
 * Connecting and refreshing report their outcome in the desktop status,
 * and an installation reports it on the tool card, so those never use this copy.
 */
export type HubAction = "open" | "account" | "updates" | "logout";

const IPC_WRAPPER = /^Error invoking remote method '[^']*': (?:\w*Error: )?/;

const KNOWN: Record<string, string> = {
  "Instale a ferramenta antes de abri-la.": "Instale a ferramenta antes de abri-la.",
  edi_access_restricted: "Conecte uma conta com assinatura ativa para abrir as ferramentas.",
  edi_clock_rollback:
    "O relógio do computador voltou no tempo. Acerte a data e a hora e tente de novo.",
};

const FALLBACK: Record<HubAction, string> = {
  open: "Não foi possível abrir a ferramenta. Tente de novo.",
  account: "Não foi possível abrir o navegador. Tente de novo.",
  updates: "Não foi possível verificar atualizações agora. Tente de novo em instantes.",
  logout: "Não foi possível sair deste computador. Tente de novo.",
};

export function failureMessage(action: HubAction, failure: unknown) {
  const message = failure instanceof Error ? failure.message.replace(IPC_WRAPPER, "") : "";
  return KNOWN[message] ?? FALLBACK[action];
}
