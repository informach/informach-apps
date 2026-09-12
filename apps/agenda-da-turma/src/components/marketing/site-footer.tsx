import { ModeToggle } from "@informach/ui/components/mode-toggle";
import Link from "next/link";
import { AgendaLogo } from "@/components/brand/agenda-logo";
import { SALES_NAVIGATION } from "./navigation";
import styles from "./sales.module.css";
export function SiteFooter() {
  return (
    <footer className={styles.wrap}>
      <div className={styles.footer}>
        <div>
          <Link href="/" aria-label="Agenda da Turma, início">
            <AgendaLogo className={styles.logo} />
          </Link>
          <p>Recados da escola. Rotina da família.</p>
        </div>
        <nav className={styles.footerNav} aria-label="Navegação do rodapé">
          {SALES_NAVIGATION.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <a href="/#perguntas">Perguntas</a>
          <Link href="/privacidade">Privacidade</Link>
          <a href="https://informach.com.br/termos">Termos</a>
        </nav>
        <ModeToggle />
      </div>
      <p className={styles.company}>
        © {new Date().getFullYear()} Informach · CNPJ 43.588.758/0001-03
      </p>
    </footer>
  );
}
