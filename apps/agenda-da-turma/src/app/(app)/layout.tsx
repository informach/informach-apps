import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <div className="flex-1 pb-20">{children}</div>
      <BottomNav />
    </div>
  );
}
