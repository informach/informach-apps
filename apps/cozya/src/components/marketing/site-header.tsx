import { ModeToggle } from "@informach/ui/components/mode-toggle";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";
import { SiteHeaderMobileNav } from "./site-header-mobile-nav";

const NAV_LINKS = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#mercado", label: "No mercado" },
  { href: "/#planos", label: "Planos" },
  { href: "/#perguntas", label: "Perguntas" },
] as const;

export type SiteHeaderVariant = "marketing" | "auth";
export type SiteHeaderProps = { variant?: SiteHeaderVariant };

export function SiteHeader({ variant = "marketing" }: SiteHeaderProps) {
  if (variant === "auth")
    return (
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="Cozya, início">
            <CozyaLogo className="h-8 w-auto text-secondary dark:text-foreground" />
          </Link>
          <ModeToggle />
        </div>
      </header>
    );
  return (
    <header className="landing-header">
      <div className="landing-shell landing-header-inner">
        <Link href="/" className="landing-brand" aria-label="Cozya, início">
          <CozyaLogo className="cozya-mark" />
        </Link>
        <nav className="landing-desktop-nav" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-header-account">
          <Link href="/login" className="landing-header-login">
            Entrar <ArrowUpRight size={17} aria-hidden />
          </Link>
          <Link href="/signup" className="landing-button landing-button-primary landing-header-cta">
            Começar grátis
          </Link>
          <div className="landing-mobile-menu">
            <SiteHeaderMobileNav links={NAV_LINKS} />
          </div>
        </div>
      </div>
    </header>
  );
}
