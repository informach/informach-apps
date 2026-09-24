"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueueOwner } from "./owner";
import { type PendingWrite, visibleForOwner } from "./queue";
import { listPendingWrites, QUEUE_CHANGED_EVENT } from "./store";

/**
 * O que está esperando a rede **desta pessoa**, para quem precisa mostrar.
 *
 * Começa vazio de propósito: no servidor não existe IndexedDB, e assumir fila
 * faria a barra piscar em toda primeira renderização — o mesmo motivo pelo qual
 * `navigator.onLine` só é consultado depois da montagem.
 */
export function useOfflineQueue() {
  const owner = useQueueOwner();
  const [entries, setEntries] = useState<PendingWrite[]>([]);

  const reload = useCallback(() => {
    if (!owner) {
      setEntries([]);
      return;
    }
    void listPendingWrites().then((all) => setEntries(visibleForOwner(all, owner)));
  }, [owner]);

  useEffect(() => {
    reload();
    window.addEventListener(QUEUE_CHANGED_EVENT, reload);
    // Outra aba do mesmo app pode ter esvaziado a fila; `focus` é o sinal mais
    // barato de "volte a olhar" que existe sem ficar consultando o armazém.
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);

  return { entries, reload };
}
