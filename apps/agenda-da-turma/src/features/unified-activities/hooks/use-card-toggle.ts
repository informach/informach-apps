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
 * - agenda `optimisticallyHidden = true` após `exitMs` (desmonta após a
 *   animação),
 * - chama a Server Action via `startTransition` em paralelo,
 * - reverte tudo se a action falhar e delega o toast pro caller via
 *   `onError`.
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

    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    if (optimisticHideWhenDone && nextStatus === "done") {
      setIsExiting(true);
      exitTimer = setTimeout(() => setOptimisticallyHidden(true), exitMs);
    }

    startTransition(async () => {
      const result = await catchActionResult(() => toggleAction(nextStatus));
      if (!result.ok) {
        setOptimisticStatus(previousStatus);
        setIsExiting(false);
        setOptimisticallyHidden(false);
        if (exitTimer) clearTimeout(exitTimer);
        onError?.(result.error);
        router.refresh();
      }
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
