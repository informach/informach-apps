import { Button } from "@informach/ui/components/button";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { InformachLogo } from "@/components/marketing/informach-logo";
import { SiteHeaderMobileNav } from "@/components/marketing/site-header-mobile-nav";
import { SITE } from "@/lib/site";

const NAV_LINKS = [
  { href: "/#manifesto", label: "Manifesto" },
  { href: "/#apps", label: "Apps" },
  { href: "/#comunidade", label: "Comunidade" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="Informach, início">
          <InformachLogo className="h-7 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ModeToggle />
          <Button asChild>
            <a href={SITE.communityUrl} target="_blank" rel="noopener noreferrer">
              Entrar na comunidade
            </a>
          </Button>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ModeToggle />
          <SiteHeaderMobileNav links={NAV_LINKS} communityUrl={SITE.communityUrl} />
        </div>
      </div>
    </header>
  );
}
