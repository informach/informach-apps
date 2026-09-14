"use client";

import { cn } from "@informach/ui/lib/utils";
import {
  BookOpen,
  Compass,
  FlaskConical,
  History,
  House,
  LayoutGrid,
  NotebookPen,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Duas formas da mesma navegação.
 *
 * No celular, barra de abas inferior com cinco destinos — o padrão que a
 * criança já conhece de qualquer app. Os destinos secundários (simulados,
 * caderno, histórico, família) ficam no hub "Meu espaço".
 *
 * No desktop há espaço de sobra, então o rail lista tudo direto.
 */
const ABAS = [
  { href: "/hoje", rotulo: "Hoje", Icone: House },
  { href: "/jornada", rotulo: "Jornada", Icone: Compass },
  { href: "/laboratorio", rotulo: "Laboratório", Icone: FlaskConical },
  { href: "/revisao", rotulo: "Revisão", Icone: RotateCcw },
  { href: "/meu-espaco", rotulo: "Meu espaço", Icone: LayoutGrid },
] as const;

const RAIL = [
  { href: "/hoje", rotulo: "Hoje", Icone: House },
  { href: "/jornada", rotulo: "Minha jornada", Icone: Compass },
  { href: "/laboratorio", rotulo: "Laboratório", Icone: FlaskConical },
  { href: "/revisao", rotulo: "Revisão", Icone: RotateCcw },
  { href: "/simulados", rotulo: "Simulados", Icone: BookOpen },
  { href: "/caderno", rotulo: "Meu caderno", Icone: NotebookPen },
  { href: "/historico", rotulo: "Meu histórico", Icone: History },
] as const;

function ativo(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

/** Rail lateral, só no desktop. */
export function Navigation() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
      {RAIL.map(({ href, rotulo, Icone }) => {
        const atual = ativo(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-controle border-2 px-3.5 font-display font-semibold no-underline transition-colors",
              atual
                ? "border-lima-fundo/50 bg-lima/50 text-tinta"
                : "border-transparent text-tinta-suave hover:bg-creme hover:text-tinta",
            )}
          >
            <Icone size={22} strokeWidth={atual ? 2.6 : 2.2} aria-hidden="true" />
            <span className="text-[0.94rem]">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Barra inferior, só no celular. Fica escondida durante a missão: ali o
 * rodapé pertence à devolutiva, e a tela é de foco total.
 */
export function NavegacaoInferior() {
  const path = usePathname();
  if (path.startsWith("/missao/")) return null;
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-sombra bg-creme lg:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <ul className="flex items-stretch">
        {ABAS.map(({ href, rotulo, Icone }) => {
          const atual = ativo(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 no-underline"
              >
                <span
                  className={cn(
                    "grid h-8 w-12 place-items-center rounded-full transition-colors",
                    atual ? "bg-lima text-tinta" : "text-tinta-suave",
                  )}
                >
                  <Icone size={21} strokeWidth={atual ? 2.7 : 2.2} aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "font-display text-[0.68rem] leading-none font-semibold",
                    atual ? "text-tinta" : "text-tinta-suave",
                  )}
                >
                  {rotulo}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
