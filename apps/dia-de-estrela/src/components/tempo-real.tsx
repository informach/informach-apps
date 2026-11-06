"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mantém a tela em dia com o resto da família: quando o tablet ou o celular
 * muda algo, o servidor avisa (SSE) e a tela busca de novo o que é dela. Sem
 * conexão de tempo real, atualiza sozinha a cada `intervaloMs`.
 */
export function TempoReal({
  intervaloMs = 60_000,
  aoMudar,
}: {
  intervaloMs?: number;
  aoMudar?: (mudanca: string) => void;
}) {
  const router = useRouter();
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const atualizar = (mudanca: string) => {
      clearTimeout(espera);
      // Junta rajadas (vários toques em seguida) numa atualização só.
      espera = setTimeout(() => {
        aoMudar?.(mudanca);
        router.refresh();
      }, 250);
    };
    const fonte = typeof EventSource !== "undefined" ? new EventSource("/api/eventos") : null;
    fonte?.addEventListener("message", (e) => atualizar(String(e.data)));
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervaloMs);
    const voltou = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => {
      clearTimeout(espera);
      clearInterval(relogio);
      fonte?.close();
      document.removeEventListener("visibilitychange", voltou);
    };
  }, [router, intervaloMs, aoMudar]);
  return null;
}
