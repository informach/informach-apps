import { INFORMACH_CONTACT } from "@informach/config/contact";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";
import { SALES_NAVIGATION } from "./navigation";
import styles from "./sales.module.css";

export function SiteFooter() {
  return (
    <footer className="border-t border-foreground/15">
      <div
        className={[styles.wrap, "grid gap-6 py-10 md:grid-cols-[1fr_auto] md:items-start"].join(
          " ",
        )}
      >
        <div className="space-y-2">
          <Link
            href="/"
            aria-label="Agenda da Turma, início"
            className="inline-flex min-h-11 items-center"
          >
            <AgendaLogo className={styles.logo} />
          </Link>
          <p className="text-sm text-muted-foreground">
            Um app da Informach · CNPJ 43.588.758/0001-03
          </p>
          <a
            href={INFORMACH_CONTACT.directMessageUrl}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline-offset-4 hover:underline"
          >
            Fale com a gente no Instagram
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <nav
            aria-label="Navegação do rodapé"
            className="flex flex-wrap gap-x-5 text-sm font-bold"
          >
            {SALES_NAVIGATION.map((link) => (
              <a key={link.href} href={link.href} className="inline-flex min-h-11 items-center">
                {link.label}
              </a>
            ))}
            <Link href="/privacidade" className="inline-flex min-h-11 items-center">
              Privacidade
            </Link>
            <a href="https://informach.com.br/termos" className="inline-flex min-h-11 items-center">
              Termos
            </a>
          </nav>
          <ModeToggle />
        </div>
      </div>
    </footer>
  );
}
