"use client";

import { CloudUpload, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { PendingWritesSheet } from "@/features/offline-queue/components/pending-writes-sheet";
import { queueMessage, summarizeQueue } from "@/features/offline-queue/queue";
import { useOfflineQueue } from "@/features/offline-queue/use-offline-queue";

/**
 * "Sem conexão" é um estado do produto, não um erro genérico.
 *
 * O momento de uso é o portão da escola, o ponto de ônibus e o corredor — onde
 * o sinal some. Sem este aviso, a pessoa marca "feito", nada acontece e ela não
 * sabe se o app travou, se errou o toque ou se é a rede.
 *
 * Hoje a barra diz duas coisas diferentes, e a ordem importa. Quando há
 * gravação esperando, ela conta **quantas** e abre a lista: esse é o número que
 * decide se dá para guardar o telefone. A frase de "sem conexão" só aparece
 * quando não há nada na fila — senão a pessoa leria "sem conexão" e continuaria
 * sem saber o que ficou para trás.
 *
 * `navigator.onLine` é otimista: com portal cativo ou sinal fraco ele continua
 * `true` e a barra de rede não aparece. A contagem da fila não depende dele, e
 * é por isso que ela é o canal principal.
 *
 * Começa em `false` de propósito: no servidor não há `navigator`, e assumir
 * offline faria a barra piscar em toda primeira renderização.
 */
export function OfflineBanner({ manageable = true }: { manageable?: boolean }) {
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const { entries } = useOfflineQueue();

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

  const summary = summarizeQueue(entries);
  const queueLine = queueMessage(summary);

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
      {queueLine ? (
        <QueueBar
          // O convite a tocar só existe onde há o que tocar: no modo criança a
          // barra é sobreposta e sem ponteiro, e mandar tocar no que não
          // responde é pior do que não convidar.
          line={manageable ? `${queueLine} Toque para ver.` : queueLine}
          tone={summary.conflicts > 0 ? "attention" : "calm"}
          manageable={manageable}
          onOpen={() => setOpen(true)}
        />
      ) : offline ? (
        <div className="flex items-center justify-center gap-2 border-b border-chart-4/40 bg-chart-4/15 px-4 py-2 text-center text-sm font-medium backdrop-blur">
          <WifiOff className="size-4 shrink-0 text-chart-4-ink" aria-hidden />
          <span>Sem conexão. Dá para ler o que já está aqui e marcar o que foi feito.</span>
        </div>
      ) : null}
      {manageable ? (
        <PendingWritesSheet entries={entries} open={open} onOpenChange={setOpen} />
      ) : null}
    </div>
  );
}

/**
 * A linha da fila.
 *
 * Vira botão só onde há para onde ir. No modo criança a barra é sobreposta e
 * sem ponteiro de propósito (ver `app/(kid)/layout.tsx`): um botão ali seria um
 * alvo que não responde ao toque, o que é pior do que texto.
 */
function QueueBar({
  line,
  tone,
  manageable,
  onOpen,
}: {
  line: string;
  tone: "calm" | "attention";
  manageable: boolean;
  onOpen: () => void;
}) {
  const surface =
    tone === "attention"
      ? "border-chart-4/40 bg-chart-4/15 text-chart-4-ink"
      : "border-border bg-muted text-foreground";
  const content = (
    <>
      <CloudUpload className="size-4 shrink-0" aria-hidden />
      {/* Sem cor própria: quem decide a tinta do texto é `surface`, senão o
          tom de atenção ficaria idêntico ao calmo (ver §7 do CLAUDE.md). */}
      <span>{line}</span>
    </>
  );
  if (!manageable)
    return (
      <div
        className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-center text-sm font-medium backdrop-blur ${surface}`}
      >
        {content}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-11 w-full items-center justify-center gap-2 border-b px-4 py-2 text-center text-sm font-medium backdrop-blur ${surface}`}
    >
      {content}
    </button>
  );
}
