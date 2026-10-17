import Link from "next/link";
import { AgendaSymbol } from "@/components/brand/agenda-logo";
import { WRAP } from "./landing-ui";
import { SALES_NAVIGATION } from "./navigation";

/**
 * O cabeçalho da prancha: o símbolo e o nome, as quatro seções e "Entrar".
 * Fica preso ao topo, com o fundo da página translúcido. No celular, como no
 * canvas, só o símbolo e "Entrar": a página é uma rolagem só, e o botão de
 * começar flutua no pé da tela.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-foreground/15 bg-app-ground/90 backdrop-blur-md">
      <div className={`${WRAP} flex h-[72px] items-center justify-between gap-4`}>
        <Link
          href="/"
          aria-label="Agenda da Turma, início"
          className="flex min-h-11 items-center gap-2.5 text-foreground no-underline"
        >
          <AgendaSymbol aria-hidden />
          <span className="hidden text-xl font-bold tracking-[-0.02em] min-[761px]:inline">
            agenda da turma
          </span>
        </Link>
        <nav aria-label="Seções" className="hidden items-center gap-7 min-[761px]:flex">
          {SALES_NAVIGATION.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-semibold text-foreground no-underline hover:text-primary-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-[14px] border-[1.5px] border-foreground px-[18px] text-[15px] font-bold text-foreground no-underline hover:bg-foreground/5"
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
