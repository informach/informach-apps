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
    toast.error("Esta funcionalidade é apenas para assinantes Pro.", {
      description: "Faça upgrade da sua conta para usar IA na agenda.",
    });
    return false;
  }
  if (response.status === 503) {
    toast.error("IA temporariamente indisponível. Tente novamente em instantes.");
    return false;
  }
  return true;
}
