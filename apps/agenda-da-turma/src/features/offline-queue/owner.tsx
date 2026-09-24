"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * De quem é a fila nesta aba.
 *
 * O IndexedDB pertence à ORIGEM, e a sessão não: num tablet de casa, uma
 * gravação feita antes do logout subiria com a sessão de quem entrasse depois,
 * e o título da atividade de uma família apareceria na folha de outra. Os dois
 * shells (`(app)` e `(kid)`) já resolvem a sessão no servidor, então o dono
 * desce daí — não há consulta nova nem identidade inventada no cliente.
 *
 * `null` significa "não sei de quem é", e aí **não há fila**: a gravação tenta
 * a rede e, falhando, falha como falhava antes. Guardar sem dono seria guardar
 * para qualquer um.
 */
const QueueOwnerContext = createContext<string | null>(null);

export function QueueOwnerProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <QueueOwnerContext.Provider value={userId}>{children}</QueueOwnerContext.Provider>;
}

export function useQueueOwner(): string | null {
  return useContext(QueueOwnerContext);
}
