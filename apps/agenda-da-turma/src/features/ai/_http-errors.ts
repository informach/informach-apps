"use client";

import { toast } from "@informach/ui/components/sonner";

/**
 * Centraliza o tratamento dos códigos de erro HTTP dos route handlers de
 * IA (`/api/ai/*`). Retorna `true` quando a resposta é OK ou erro genérico
 * (caller mostra toast genérico). Retorna `false` quando o erro é
 * "especial" (429 rate-limit, 403 sub required, 503 AI off) — caller deve
 * parar o fluxo sem toast adicional porque já foi mostrado aqui.
 */
export function handleAiHttpError(response: Response): boolean {
  if (response.ok) return true;
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
    toast.error("Confirme seu e-mail e a permissão para usar IA nesta criança em Minha conta.");
    return false;
  }
  if (response.status === 402) {
    toast.error("O saldo compartilhado não cobre esta operação. Veja os créditos em Minha conta.");
    return false;
  }
  if (response.status === 409) {
    response
      .json()
      .catch(() => null)
      .then((data: { code?: string } | null) => {
        if (data?.code === "AI_PROCESSING")
          toast.info(
            "A operação está sendo concluída. Aguarde e tente novamente para recuperar o resultado.",
          );
        else if (data?.code === "AI_RECOVERY_REQUIRED")
          toast.error(
            "A operação precisa de recuperação. Não envie novamente; entre em contato pelo suporte em Minha conta.",
          );
        else if (data?.code === "AI_RESULT_EXPIRED")
          toast.error(
            "O prazo de recuperação deste resultado terminou. Atualize a página para iniciar uma nova operação.",
          );
        else
          toast.error(
            "O contexto da família ou o custo mudou. Atualize a página antes de continuar.",
          );
      });
    return false;
  }
  if (response.status === 503) {
    toast.error("IA temporariamente indisponível. Tente novamente em instantes.");
    return false;
  }
  return true;
}
