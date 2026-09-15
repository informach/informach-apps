"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * "Sem conexão" é um estado do produto, não um erro genérico.
 *
 * O momento de uso é o portão da escola, o ponto de ônibus e o corredor — onde
 * o sinal some. Sem este aviso, a pessoa marca "feito", nada acontece e ela não
 * sabe se o app travou, se errou o toque ou se é a rede.
 *
 * O aviso diz o que continua funcionando: **ler** a rotina que já está na tela.
 * Ele não promete fila nem sincronização — a leitura offline e a fila de
 * conclusões são a próxima fase, e prometer aqui o que o app ainda não faz
 * seria pior do que não avisar.
 *
 * Começa em `false` de propósito: no servidor não há `navigator`, e assumir
 * offline faria a barra piscar em toda primeira renderização.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-chart-4/40 bg-chart-4/15 px-4 py-2 text-center text-sm font-medium"
    >
      <WifiOff className="size-4 shrink-0 text-chart-4-ink" aria-hidden />
      <span>Sem conexão. Você pode ler o que já está aqui; mudanças esperam a rede voltar.</span>
    </div>
  );
}
