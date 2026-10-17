import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { InformachLogo } from "@/components/marketing/informach-logo";
import { SiteHeaderMobileNav } from "@/components/marketing/site-header-mobile-nav";

const NAV_LINKS = [
  { href: "/#produtos", label: "Produtos" },
  { href: "/#sistema-zero", label: "Sistema Zero" },
  { href: "/#quem-faz", label: "Quem faz" },
  { href: "/#contato", label: "Contato" },
] as const;

const CTA = { href: "/#comecar", label: "Encontrar o produto certo" } as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-warm bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex min-h-11 items-center" aria-label="Informach, início">
          <InformachLogo className="h-9 w-auto md:h-10" priority />
        </Link>

        <nav
          aria-label="Principal"
          className="hidden items-center gap-6 text-[15px] font-semibold text-ink lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-sphere-ink hover:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ModeToggle />
          <a
            href={CTA.href}
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-[18px] text-[15px] font-bold text-paper no-underline transition-opacity hover:opacity-90"
          >
            {CTA.label}
          </a>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ModeToggle />
          <SiteHeaderMobileNav links={NAV_LINKS} cta={CTA} />
        </div>
      </div>
    </header>
  );
}
