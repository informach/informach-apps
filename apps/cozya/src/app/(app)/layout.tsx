import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppNavigation } from "@/components/app-shell/app-navigation";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <div
        id="app-content"
        className="flex-1 pb-[calc(92px+env(safe-area-inset-bottom))] md:pb-0"
        tabIndex={-1}
      >
        {children}
      </div>
      <AppNavigation variant="bottom" />
    </div>
  );
}
