import { toast } from "@informach/ui/components/sonner";

/**
 * Returns true if the response is OK (or non-special error). Returns false if
 * a known-special error (rate-limit/forbidden/unavailable) was handled and the
 * caller should stop the flow without showing a generic toast.
 */
export function handleAiHttpError(response: Response): boolean {
  if (response.ok) return true;
  if (response.status === 402) {
    toast.error("Seus créditos de IA acabaram.", {
      description: "Suas receitas, compras e o modo de preparo continuam disponíveis.",
      action: {
        label: "Ver saldo",
        onClick: () => {
          window.location.href = "/settings/billing";
        },
      },
    });
    return false;
  }
  if (response.status === 413) {
    toast.error("Arquivo muito grande. Envie uma imagem de até 5 MB ou áudio de até 10 MB.");
    return false;
  }
  if (response.status === 401) {
    toast.error("Entre novamente para continuar. Seu conteúdo permanece nesta tela.");
    return false;
  }
  if (response.status === 429) {
    response
      .json()
      .catch(() => null)
      .then((data: { retryAfter?: number } | null) => {
        const wait = data?.retryAfter ? ` Tente novamente em ~${data.retryAfter}s.` : "";
        toast.error(`Aguarde alguns minutos antes de usar a IA novamente.${wait}`);
      });
    return false;
  }
  if (response.status === 403) {
    toast.error("Verifique seu e-mail e ative o teste gratuito ou o Pro para usar a IA.");
    return false;
  }
  if (response.status === 503) {
    toast.error("Indisponível no momento. Tente novamente em instantes.");
    return false;
  }
  return true;
}
