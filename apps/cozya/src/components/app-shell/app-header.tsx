import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";
import { getKitchenAccess } from "@/features/kitchen/access";
import { daysBetween } from "@/features/kitchen/dates";
import { requireUserServer } from "@/lib/auth";
import { AppNavigation } from "./app-navigation";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const user = await requireUserServer();
  const access = await getKitchenAccess(user.id);
  // Calendar days in São Paulo, as on Hoje: the last day of the trial reads "último dia".
  const trialDaysLeft =
    access.trialActive && access.trialEndsAt ? daysBetween(new Date(), access.trialEndsAt) : null;
  const trialLabel =
    trialDaysLeft === null
      ? ""
      : trialDaysLeft <= 0
        ? "Teste: último dia"
        : `Teste: ${trialDaysLeft} ${trialDaysLeft === 1 ? "dia" : "dias"}`;
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
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-7 px-4 md:h-[72px] md:px-10">
        <Link href="/hoje" className="flex shrink-0 items-center" aria-label="Cozya, Hoje">
          <CozyaLogo className="h-[30px] w-auto text-secondary dark:text-foreground" />
        </Link>
        <AppNavigation variant="top" />

        <div className="ml-auto flex items-center gap-2 [&_button]:min-h-11 [&_button]:min-w-11">
          {trialDaysLeft !== null ? (
            trialDaysLeft <= 3 ? (
              <Link
                href="/upgrade"
                className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-foreground hover:bg-accent"
              >
                {trialLabel}
              </Link>
            ) : (
              // During the trial the chip only informs; the offer comes in the last three days.
              <span className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 text-xs font-bold text-foreground">
                {trialLabel}
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
