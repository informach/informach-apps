"use client";
import { useEffect } from "react";

/** Mantém a tela acesa enquanto a rotina estiver aberta (tablet da criança). */
export function useTelaAcesa(ativa: boolean) {
  useEffect(() => {
    if (!ativa || !("wakeLock" in navigator)) return;
    let trava: WakeLockSentinel | null = null;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((t) => {
          trava = t;
        })
        .catch(() => undefined);
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      void trava?.release().catch(() => undefined);
    };
  }, [ativa]);
}

/**
 * Sinal de vida do aparelho a cada 4 minutos: diz aos pais que o tablet está
 * ligado e renova a conexão de 30 dias.
 */
export function useSinalDeVida() {
  useEffect(() => {
    const enviar = () => {
      if (document.visibilityState === "visible")
        void fetch("/api/aparelho/sinal", { method: "POST" }).catch(() => undefined);
    };
    enviar();
    const id = setInterval(enviar, 4 * 60_000);
    document.addEventListener("visibilitychange", enviar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", enviar);
    };
  }, []);
}

/** Tela cheia só no aparelho de verdade, nunca dentro de um iframe (prévia). */
export function pedirTelaCheia() {
  if (window.self !== window.top) return;
  document.documentElement.requestFullscreen?.().catch(() => undefined);
}
