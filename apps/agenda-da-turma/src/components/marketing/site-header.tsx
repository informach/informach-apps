import { Menu } from "lucide-react";
import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";
import { SALES_NAVIGATION } from "./navigation";
import styles from "./sales.module.css";

/**
 * No computador, os links por extenso. No celular, um menu de disclosure
 * (`details`): abre com toque, Enter ou Espaço, sem script, e a página não
 * esconde mais a navegação inteira atrás de nada.
 */
export function SiteHeader() {
  return (
    <header className={[styles.wrap, styles.header].join(" ")}>
      <Link href="/" aria-label="Agenda da Turma, início" className={styles.brand}>
        <AgendaLogo className={styles.logo} />
      </Link>
      <nav className={styles.nav} aria-label="Navegação principal">
        {SALES_NAVIGATION.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
        <Link className={styles.login} href="/login">
          Entrar
        </Link>
      </nav>
      <div className="flex shrink-0 items-center gap-2 min-[900px]:hidden">
        <Link className={styles.login} href="/login">
          Entrar
        </Link>
        <details className={styles.menu}>
          <summary aria-label="Abrir o menu">
            <Menu className="size-5" aria-hidden />
            <span className={styles.menuLabel}>Menu</span>
          </summary>
          <nav className={styles.menuPanel} aria-label="Menu">
            {SALES_NAVIGATION.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
