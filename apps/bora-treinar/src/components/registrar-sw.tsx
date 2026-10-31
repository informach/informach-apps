"use client";

import { useEffect } from "react";

/**
 * Registra o service worker da casca.
 *
 * Fica em um componente cliente, e não em script inline, porque a CSP do app
 * usa nonce por requisição — um `<script>` solto seria bloqueado.
 *
 * Falha em silêncio de propósito: sem service worker o aplicativo continua
 * funcionando inteiro pela rede. Isto é resiliência, não requisito.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    /* Só em produção. Em desenvolvimento os pacotes do Next são servidos em
       URLs estáveis sem hash de conteúdo, e o cache "primeiro o guardado"
       prenderia a primeira versão de cada tela até alguém limpar os dados do
       site na mão. */
    if (process.env.NODE_ENV !== "production") {
      /* Não registrar não é o mesmo que desinstalar: o `localhost` do
         desenvolvimento é a mesma origem de um `pnpm build && pnpm start`
         rodado antes, e um worker instalado por ele continuaria servindo
         pacotes guardados por cima do servidor de desenvolvimento. */
      navigator.serviceWorker
        .getRegistrations()
        .then((registros) => Promise.all(registros.map((registro) => registro.unregister())))
        .catch(() => undefined);
      if ("caches" in window)
        caches
          .keys()
          .then((nomes) =>
            Promise.all(
              nomes.filter((nome) => nome.startsWith("bora-")).map((nome) => caches.delete(nome)),
            ),
          )
          .catch(() => undefined);
      return;
    }
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    // Depois do load: registrar durante a hidratação disputa banda com os
    // pacotes que a primeira tela precisa.
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);
  return null;
}
