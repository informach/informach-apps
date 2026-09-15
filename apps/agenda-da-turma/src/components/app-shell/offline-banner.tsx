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
 * E diz o que NÃO funciona, porque não há fila de escrita: marcar como feito
 * precisa de rede, e a intenção é descartada quando a gravação falha. O texto
 * já disse "as mudanças esperam a rede voltar" — elas não esperam, e uma mãe
 * no portão da escola guardaria o telefone achando que estava resolvido.
 *
 * `navigator.onLine` é otimista: com portal cativo ou sinal fraco ele continua
 * `true` e a barra não aparece. Por isso ela é reforço, nunca o único canal —
 * quem explica o caso comum continua sendo o erro do próprio card.
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

  return (
    /*
     * A live region existe SEMPRE, e só o miolo troca. Inserir o nó junto com o
     * conteúdo faz o anúncio ser pulado por alguns leitores, e numa conexão
     * instável a remontagem repetia o anúncio a cada ciclo.
     *
     * `sticky` logo abaixo do cabeçalho (que é `top-0 z-40`): a barra ficava no
     * topo do documento, então numa lista rolada ela sumia da tela justamente
     * quando a gravação falhava.
     */
    <div role="status" className="sticky top-16 z-30">
      {offline ? (
        <div className="flex items-center justify-center gap-2 border-b border-chart-4/40 bg-chart-4/15 px-4 py-2 text-center text-sm font-medium backdrop-blur">
          <WifiOff className="size-4 shrink-0 text-chart-4-ink" aria-hidden />
          <span>
            Sem conexão. Dá para ler o que já está aqui; marcar como feito precisa de rede.
          </span>
        </div>
      ) : null}
    </div>
  );
}
