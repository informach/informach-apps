import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";
import { SALES_NAVIGATION } from "./navigation";
import styles from "./sales.module.css";
export function SiteHeader() {
  return (
    <header className={[styles.wrap, styles.header].join(" ")}>
      <Link href="/" aria-label="Agenda da Turma, início">
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
    </header>
  );
}
