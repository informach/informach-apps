import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";
import { getKitchenAccess } from "@/features/kitchen/access";
import { requireUserServer } from "@/lib/auth";
import { AppNavigation } from "./app-navigation";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const user = await requireUserServer();
  const access = await getKitchenAccess(user.id);
  const trialDaysLeft =
    access.trialActive && access.trialEndsAt
      ? Math.max(1, Math.ceil((access.trialEndsAt.getTime() - Date.now()) / 86400000))
      : null;
  // Selling before someone has used the kitchen pushes them away: the offer appears after the trial.
  const trialEnded = !access.isPro && !access.trialActive && !!access.profile?.trialStartedAt;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-background focus:p-4"
      >
        Pular para o conteúdo
      </a>
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4 md:px-8">
        <Link href="/hoje" className="flex shrink-0 items-center" aria-label="Cozya, Hoje">
          <CozyaLogo className="h-8 w-auto text-secondary dark:text-foreground" />
        </Link>
        <AppNavigation variant="top" />

        <div className="ml-auto flex items-center gap-2 [&_button]:min-h-11 [&_button]:min-w-11">
          {trialDaysLeft !== null ? (
            trialDaysLeft <= 3 ? (
              <Link
                href="/upgrade"
                className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-foreground hover:bg-accent"
              >
                Teste: {trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"}
              </Link>
            ) : (
              // During the trial the chip only informs; the offer comes in the last three days.
              <span className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-foreground">
                Teste: {trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"}
              </span>
            )
          ) : trialEnded ? (
            <Button asChild size="sm">
              <Link href="/upgrade">Assinar</Link>
            </Button>
          ) : null}
          <ModeToggle />
          <UserMenu
            user={{
              id: user.id,
              name: user.name ?? null,
              email: user.email,
              image: user.image ?? null,
            }}
          />
        </div>
      </div>
    </header>
  );
}
