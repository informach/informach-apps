import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <div id="app-content" className="flex-1" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
