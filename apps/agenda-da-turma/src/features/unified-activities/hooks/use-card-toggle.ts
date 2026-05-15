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
 *   o caso) e chama `router.refresh()` pra invalidar o RSC do parent
 *   (KPIs do dashboard, ordenação da lista de atividades, etc),
 * - reverte tudo se a action falhar e delega o toast pro caller via
 *   `onError`.
 *
 * O `router.refresh()` em sucesso é defensivo: as server actions também
 * chamam `refresh()` de `next/cache` (commit c200c94), mas em prod com
 * `output: standalone` + `next start` essa via não dispara consistentemente
 * o re-fetch RSC do client. Belt + suspenders.
 *
 * Hook é agnóstico de UX (sem strings de toast); cada card decide as
 * mensagens com base nos códigos de erro específicos da sua action.
 */
export function useCardToggle({
  initialStatus,
  optimisticHideWhenDone,
  toggleAction,
  onError,
  exitMs = 280,
}: Args) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<Status>(initialStatus);
  const [isExiting, setIsExiting] = useState(false);
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  // Sync quando o server retorna nova versão do item (refresh()/router push).
  // Reset cobre o caso em que o card "voltou" antes do timer de exit terminar.
  useEffect(() => {
    setOptimisticStatus(initialStatus);
    setIsExiting(false);
    setOptimisticallyHidden(false);
  }, [initialStatus]);

  const handleToggle = (next: boolean) => {
    const previousStatus = optimisticStatus;
    const nextStatus: Status = next ? "done" : "pending";
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
        onError?.(result.error);
        router.refresh();
        return;
      }

      if (willExit) {
        setOptimisticallyHidden(true);
      }
      router.refresh();
    });
  };

  return {
    isDone: optimisticStatus === "done",
    isExiting,
    optimisticallyHidden,
    pending,
    handleToggle,
  };
}
