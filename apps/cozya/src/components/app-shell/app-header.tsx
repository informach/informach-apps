import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";
import { getIsProForUser } from "@/features/billing/server-cache";
import { requireUserServer } from "@/lib/auth";
import { UserMenu } from "./user-menu";

export async function AppHeader() {
  const user = await requireUserServer();
  const isPro = await getIsProForUser(user.id);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center" aria-label="Cozya — início">
          <CozyaLogo className="h-8 w-auto text-secondary dark:text-foreground" />
        </Link>

        <div className="flex items-center gap-2">
          {!isPro && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/upgrade">Seja Pro</Link>
            </Button>
          )}
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
