import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppNavigation } from "@/components/app-shell/app-navigation";
import { CozyaAiContext } from "@/features/family/ai-context";
import { cozyaAuthority } from "@/features/family/context";
import { redirectIfUnauthenticated } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await redirectIfUnauthenticated();
  const actor = await cozyaAuthority(user.id);

  return (
    <CozyaAiContext familyGroupId={actor.familyGroupId}>
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
    </CozyaAiContext>
  );
}
