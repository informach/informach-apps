"use client";

import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@informach/ui/components/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";

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
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Abrir menu">
                    <Menu className="size-5" aria-hidden />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <div className="mt-8 flex flex-col gap-1">
                    {NAV_LINKS.map((link) => (
                      <SheetClose asChild key={link.href}>
                        <a
                          href={link.href}
                          className="rounded-md px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          {link.label}
                        </a>
                      </SheetClose>
                    ))}
                    <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
                      <SheetClose asChild>
                        <Button variant="outline" asChild>
                          <Link href="/login">Entrar</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button asChild>
                          <Link href="/signup">Criar conta grátis</Link>
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
