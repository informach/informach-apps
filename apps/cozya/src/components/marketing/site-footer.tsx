import { ChefHat } from "lucide-react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#perguntas", label: "Perguntas" },
] as const;

const LEGAL_LINKS = [
  { href: "#", label: "Termos de uso" },
  { href: "#", label: "Privacidade" },
  { href: "#", label: "Contato" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ChefHat className="size-5" aria-hidden />
              </span>
              <span className="text-lg">Cozya</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              Receitas rápidas, sem caos. Capture, organize e cozinhe direto do celular.
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
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} Cozya. Receitas rápidas, sem caos.</p>
          <p>Feito para quem cozinha em casa.</p>
        </div>
      </div>
    </footer>
  );
}
