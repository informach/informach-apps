import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#perguntas", label: "Perguntas" },
] as const;

const ACCOUNT_LINKS = [
  { href: "/login", label: "Entrar" },
  { href: "/signup", label: "Criar conta" },
] as const;

const LEGAL_LINKS = [
  { href: "https://informach.com.br/termos", label: "Termos de uso" },
  { href: "https://informach.com.br/privacidade", label: "Privacidade" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Link href="/" className="flex items-center" aria-label="Agenda da Turma, início">
              <AgendaLogo className="h-8 w-auto text-foreground" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              A rotina escolar dos seus filhos num lugar só. Sem caderno perdido, sem print no
              WhatsApp.
            </p>
            <p className="max-w-xs text-xs text-muted-foreground/80 leading-relaxed">
              Informach. Núcleo de Aprendizagem Ltda
              <br />
              CNPJ 43.588.758/0001-03
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Produto</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Conta</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {ACCOUNT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="transition-colors hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            &copy; {year} Informach. Núcleo de Aprendizagem Ltda. Agenda da Turma é uma marca da
            Informach.
          </p>
          <p>Feito pra família que acompanha a escola de perto.</p>
        </div>
      </div>
    </footer>
  );
}
