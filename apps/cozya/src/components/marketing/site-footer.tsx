import Link from "next/link";
import { CozyaLogo } from "@/components/brand/cozya-logo";

const NAV_LINKS = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#recursos", label: "Suas receitas" },
  { href: "/#planos", label: "Planos" },
  { href: "/#perguntas", label: "Perguntas" },
] as const;

const ACCOUNT_LINKS = [
  { href: "/login", label: "Entrar" },
  { href: "/signup", label: "Criar conta" },
] as const;

const LEGAL_LINKS = [
  { href: "/termos", label: "Termos de uso" },
  { href: "/privacidade", label: "Privacidade" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer border-t border-border/60 bg-background">
      <div className="landing-shell py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Link href="/" className="flex items-center" aria-label="Cozya, início">
              <CozyaLogo className="cozya-mark h-8 w-auto" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              Sua semana à mesa. Receitas, marmitas e compras organizadas para quem cozinha em casa.
            </p>
            <p className="max-w-xs text-xs text-muted-foreground/80 leading-relaxed">
              Informach — Núcleo de Aprendizagem Ltda
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
                  <Link href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            &copy; {year} Informach — Núcleo de Aprendizagem Ltda. Cozya é uma marca da Informach.
          </p>
          <p>Feito para quem cozinha em casa.</p>
        </div>
      </div>
    </footer>
  );
}
