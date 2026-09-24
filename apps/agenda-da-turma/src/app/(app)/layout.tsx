import { type ReactNode, Suspense } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { OfflineBanner } from "@/components/app-shell/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/app-shell/service-worker";
import { getAddEntitlement } from "@/features/notices/trial";
import { OfflineQueueFlusher } from "@/features/offline-queue/components/offline-queue-flusher";
import { QueueOwnerProvider } from "@/features/offline-queue/owner";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await redirectIfUnauthenticated();

  return (
    // Fundo do app com a tinta de 5% (ver ELEVAÇÃO em `globals.css`). Era
    // branco sobre branco: `--background` e `--card` quase coincidem no tema
    // claro, então cartão nenhum se destacava de nada.
    // `QueueOwnerProvider` envolve o shell inteiro: a fila de gravações vive no
    // IndexedDB da origem, e sem saber de quem ela é, uma conclusão feita antes
    // do logout subiria com a sessão de quem entrasse depois neste aparelho.
    <QueueOwnerProvider userId={user.id}>
      <div className="flex min-h-dvh flex-col bg-app-ground">
        <ServiceWorkerRegistrar />
        <OfflineQueueFlusher />
        <AppHeader />
        <OfflineBanner />
        <div className="flex-1 pb-20">{children}</div>
        {/*
        Fora do caminho crítico: a franquia custa uma consulta de billing e duas
        no banco, e sem o Suspense o shell inteiro esperava por elas antes de
        qualquer boundary da página poder fazer stream.
      */}
        <Suspense fallback={null}>
          <BottomNavSlot userId={user.id} />
        </Suspense>
      </div>
    </QueueOwnerProvider>
  );
}

async function BottomNavSlot({ userId }: { userId: string }) {
  return <BottomNav entitlement={await getAddEntitlement(userId)} />;
}
