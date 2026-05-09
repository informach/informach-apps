import Link from "next/link";
import { InformachLogo } from "@/components/marketing/informach-logo";
import { APPS } from "@/lib/apps";
import { SITE } from "@/lib/site";

const COMPANY_LINKS = [
  { href: "/#manifesto", label: "Manifesto" },
  { href: "/#apps", label: "Apps" },
  { href: "/#comunidade", label: "Comunidade" },
] as const;

const LEGAL_LINKS = [
  { href: "/termos", label: "Termos de uso" },
  { href: "/privacidade", label: "Privacidade" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Link href="/" className="flex items-center" aria-label="Informach, início">
              <InformachLogo className="h-7 w-auto" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">{SITE.tagline}</p>
            <p className="max-w-xs text-xs text-muted-foreground leading-relaxed">
              {SITE.legalName}
              <br />
              CNPJ {SITE.cnpj}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Apps</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {APPS.map((app) => (
                <li key={app.slug}>
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-foreground"
                  >
                    {app.name}
                  </a>
                </li>
              ))}
              <li className="text-muted-foreground">Mais em breve</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Empresa</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={SITE.communityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {SITE.communityName}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="transition-colors hover:text-foreground"
                >
                  Contato
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            &copy; {year} {SITE.legalName}. Todos os direitos reservados.
          </p>
          <p>
            <a
              href={`mailto:${SITE.contactEmail}`}
              className="transition-colors hover:text-foreground"
            >
              {SITE.contactEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
