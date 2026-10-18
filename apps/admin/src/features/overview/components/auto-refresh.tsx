"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Pede ao servidor os números de novo a cada minuto, só com a aba visível.
 * A conferência dos serviços tem cache de um minuto, então não multiplica chamadas.
 */
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(tick, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
