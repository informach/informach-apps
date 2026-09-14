import { type ReactNode, Suspense } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { getAddEntitlement } from "@/features/notices/trial";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await redirectIfUnauthenticated();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
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
  );
}

async function BottomNavSlot({ userId }: { userId: string }) {
  return <BottomNav entitlement={await getAddEntitlement(userId)} />;
}
