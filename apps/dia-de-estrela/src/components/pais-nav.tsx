"use client";
import { House, ListChecks, PiggyBank, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/inicio", rotulo: "Início", Icone: House },
  { href: "/rotinas", rotulo: "Rotinas", Icone: ListChecks },
  { href: "/cofrinho", rotulo: "Cofrinho", Icone: PiggyBank },
  { href: "/ajustes", rotulo: "Ajustes", Icone: Settings },
] as const;

/** Barra de baixo no celular; trilho lateral do `lg` para cima. */
export function PaisNav() {
  const atual = usePathname();
  return (
    <nav
      aria-label="Área dos pais"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t-2 border-linha bg-white pb-[env(safe-area-inset-bottom)] lg:static lg:flex-col lg:gap-1 lg:border-t-0 lg:bg-transparent lg:px-3 lg:pb-4"
    >
      {ABAS.map(({ href, rotulo, Icone }) => {
        const ativa = atual === href || atual.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativa ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-extrabold lg:min-h-12 lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-controle lg:px-4 lg:text-base ${
              ativa ? "text-ceu-escuro lg:bg-ceu-claro" : "text-tinta-suave hover:text-tinta"
            }`}
          >
            <span
              className={`grid h-8 w-14 place-items-center rounded-full lg:h-auto lg:w-auto ${ativa ? "bg-ceu-claro lg:bg-transparent" : ""}`}
            >
              <Icone className="size-5" aria-hidden="true" />
            </span>
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
