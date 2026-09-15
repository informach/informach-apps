"use client";

import { useEffect } from "react";

/**
 * Registra o service worker para todo mundo, e não só para quem aceita push.
 *
 * Ele fazia duas coisas e era registrado por uma: o painel de notificações
 * chamava `register` ao ligar os lembretes, então quem nunca abriu aquela tela
 * — a maioria — não tinha service worker nenhum e continuava recebendo a tela
 * de dinossauro do navegador quando o sinal caía.
 *
 * Registrar não inscreve em push: a inscrição continua sendo um passo
 * explícito, no painel, com permissão do navegador.
 *
 * Fora do caminho crítico de propósito: o registro espera o `load` para não
 * disputar banda com o primeiro render.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Sem service worker o app continua inteiro — só perde a tela de
        // "sem conexão" e o cache do esqueleto.
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
