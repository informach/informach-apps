import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/app-shell/offline-banner";
import { OfflineQueueFlusher } from "@/features/offline-queue/components/offline-queue-flusher";
import { QueueOwnerProvider } from "@/features/offline-queue/owner";
import { redirectIfUnauthenticated } from "@/lib/auth";

/**
 * O shell do modo criança: nenhum.
 *
 * Fica fora do grupo `(app)` de propósito. Ali moram o cabeçalho com "Seja
 * Pro", o menu do avatar e o rodapé de navegação — tudo endereçado ao
 * responsável, e tudo a um toque de distância de uma criança com o telefone na
 * mão. Aqui a tela é só a atividade.
 *
 * A sessão continua sendo exigida: o modo criança é uma vista dos dados da
 * família, não um acesso público.
 */
export default async function KidLayout({ children }: { children: ReactNode }) {
  const user = await redirectIfUnauthenticated();
  return (
    <QueueOwnerProvider userId={user.id}>
      <div className="min-h-dvh bg-app-ground">
        <OfflineQueueFlusher />
        {/* O único elemento de shell que sobrevive aqui: uma criança marcando
          "feito" sem rede precisa saber que não foi ela que errou.
          Sobreposta, e não no fluxo: o `main` da criança é `min-h-dvh`, e uma
          barra empilhada criaria rolagem numa tela desenhada para não rolar. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
          {/* `manageable={false}`: a barra aqui é sobreposta e sem ponteiro, e a
            folha de gravações pendentes é conversa de adulto. */}
          <OfflineBanner manageable={false} />
        </div>
        {children}
      </div>
    </QueueOwnerProvider>
  );
}
