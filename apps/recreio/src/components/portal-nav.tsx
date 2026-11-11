"use client";
import { cn } from "@informach/ui/lib/utils";
import { LibraryBig, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const itens = [
  { href: "/estante", rotulo: "Estante", Icone: LibraryBig },
  { href: "/conta", rotulo: "Conta", Icone: UserRound },
] as const;

export function PortalNav() {
  const caminho = usePathname();
  return (
    <nav aria-label="Portal" className="flex items-center gap-1">
      {itens.map(({ href, rotulo, Icone }) => {
        const atual = caminho === href || caminho.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={atual ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-controle px-3 text-sm font-bold transition-colors",
              atual ? "bg-painel-2 text-tinta" : "text-tinta-suave hover:text-tinta",
            )}
          >
            <Icone className="size-4" aria-hidden="true" />
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
