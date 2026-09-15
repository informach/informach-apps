"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { catchActionResult } from "@/lib/action-result";

type Status = "pending" | "done";

type ToggleResult = { ok: true; value: unknown } | { ok: false; error: { code: string } };

type Args = {
  initialStatus: Status;
  optimisticHideWhenDone: boolean;
  toggleAction: (next: Status) => Promise<ToggleResult>;
  onSuccess?: (previousStatus: Status, nextStatus: Status) => void;
  onError?: (error: { code: string }) => void;
  /** Tem que casar com a duration da transition do wrapper visual. */
  exitMs?: number;
};

/**
 * Centraliza o pattern de toggle otimista usado por ActivityCard e
 * UnifiedExtraActivityCard:
 *
 * - aplica `optimisticStatus` imediato pra feedback visual,
 * - dispara `isExiting` quando o card vai sair do bucket
 *   (`optimisticHideWhenDone`) — o caller usa essa flag pra anim CSS,
 * - chama a Server Action e o exit timer EM PARALELO (`Promise.all`),
 * - quando ambos terminam: marca `optimisticallyHidden = true` (se for
 *   o caso), notifica o parent e chama `router.refresh()` pra sincronizar
 *   o RSC do parent (KPIs do dashboard, ordenação da lista de atividades),
 * - reverte tudo se a action falhar e delega o toast pro caller via
 *   `onError`.
 *
 * Hook é agnóstico de UX (sem strings de toast); cada card decide as
 * mensagens com base nos códigos de erro específicos da sua action.
 *
 * ⚠️ **Há uma SEGUNDA implementação deste fluxo** em
 * `features/kid-mode/components/kid-mode-screen.tsx`. Ela existe porque este
 * hook chama `router.refresh()` a cada sucesso, e no modo criança isso
 * reordenaria a lista embaixo de uma criança no meio da sessão. Ao consertar
 * algo aqui — rollback, conflito de versão, condição de corrida — **olhe lá
 * também**: o conserto do conflito de versão já precisou ser feito duas vezes.
 */
export function useCardToggle({
  initialStatus,
  optimisticHideWhenDone,
  toggleAction,
  onSuccess,
  onError,
  exitMs = 280,
}: Args) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<Status>(initialStatus);
  const [isExiting, setIsExiting] = useState(false);
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  /**
   * O que a pessoa tentou quando deu errado.
   *
   * Sem isto, falhar era um beco: o card revertia, o erro aparecia, e a única
   * saída era tocar o botão de novo — o que é fácil num card, mas invisível como
   * opção. No portão da escola, com sinal indo e voltando, a pessoa precisa de
   * um alvo que diga "dá para insistir" em vez de adivinhar.
   */
  const [failedAttempt, setFailedAttempt] = useState<Status | null>(null);

  // Sync quando o server retorna nova versão do item (refresh()/router push).
  // Reset cobre o caso em que o card "voltou" antes do timer de exit terminar.
  useEffect(() => {
    setOptimisticStatus(initialStatus);
    setIsExiting(false);
    setOptimisticallyHidden(false);
    setFailedAttempt(null);
  }, [initialStatus]);

  const handleToggle = (next: boolean) => {
    const previousStatus = optimisticStatus;
    const nextStatus: Status = next ? "done" : "pending";
    setFailedAttempt(null);
    setOptimisticStatus(nextStatus);

    const willExit = optimisticHideWhenDone && nextStatus === "done";
    if (willExit) {
      setIsExiting(true);
    }

    startTransition(async () => {
      // Roda action e exit timer EM PARALELO. Em sucesso, espera ambos pra
      // (a) preservar a animação CSS (sem refresh cortar antes dos exitMs)
      // e (b) sincronizar UI com o server (KPIs, ordenação na lista).
      const exitPromise = willExit
        ? new Promise<void>((resolve) => setTimeout(resolve, exitMs))
        : Promise.resolve();
      const [result] = await Promise.all([
        catchActionResult(() => toggleAction(nextStatus)),
        exitPromise,
      ]);

      if (!result.ok) {
        setOptimisticStatus(previousStatus);
        setIsExiting(false);
        setOptimisticallyHidden(false);
        setFailedAttempt(nextStatus);
        onError?.(result.error);
        router.refresh();
        return;
      }

      if (willExit) {
        setOptimisticallyHidden(true);
      }
      onSuccess?.(previousStatus, nextStatus);
      router.refresh();
    });
  };

  return {
    isDone: optimisticStatus === "done",
    isExiting,
    optimisticallyHidden,
    pending,
    handleToggle,
    /**
     * Repete a última tentativa que falhou, ou `null` quando não houve falha.
     *
     * Não é fila offline: nada fica guardado, nada sobe sozinho quando a rede
     * volta. É só o alvo para insistir, no momento em que a pessoa vê o erro —
     * o `router.refresh()` da falha já trouxe a versão nova, então a segunda
     * tentativa não repete um conflito de versão.
     */
    retry: failedAttempt === null ? null : () => handleToggle(failedAttempt === "done"),
  };
}
