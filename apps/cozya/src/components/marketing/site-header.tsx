import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";
import { SiteHeaderMobileNav } from "./site-header-mobile-nav";

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#perguntas", label: "Perguntas" },
] as const;

export type SiteHeaderVariant = "marketing" | "auth";

export type SiteHeaderProps = {
  /**
   * `"marketing"` (default) — full header com nav, ModeToggle e CTAs Login/Criar conta.
   * `"auth"` — só logo + ModeToggle. Sem links de navegação nem CTAs (usado em /signup, /choose-plan etc.).
   */
  variant?: SiteHeaderVariant;
};

/**
 * Server Component. The only interactive piece is the mobile nav drawer
 * (`<SiteHeaderMobileNav />`), which is the sole `"use client"` leaf.
 * `ModeToggle` is its own client component already.
 */
export function SiteHeader({ variant = "marketing" }: SiteHeaderProps) {
  const isAuth = variant === "auth";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="Cozya — início">
          <CozyaLogo className="h-8 w-auto text-secondary dark:text-foreground" />
        </Link>

        {!isAuth && (
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        {isAuth ? (
          <div className="flex items-center gap-1">
            <ModeToggle />
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-2 md:flex">
              <ModeToggle />
              <Button variant="ghost" asChild>
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Criar conta</Link>
              </Button>
            </div>

            <div className="flex items-center gap-1 md:hidden">
              <ModeToggle />
              <SiteHeaderMobileNav links={NAV_LINKS} />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
