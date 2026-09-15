"use client";
import { CalendarDays, House, ListChecks, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AddSheet } from "@/features/activities/components/add-sheet";
import type { AddEntitlement } from "@/features/notices/entitlement";

/**
 * Quatro destinos e uma ação.
 *
 * Antes eram cinco destinos — Rotina, Atividades, Recados, Calendário,
 * Família — e três deles mostravam a mesma lista em formatos diferentes,
 * enquanto **Recados** gastava um dos cinco lugares para ser um arquivo de
 * documentos de consulta rara. O original continua alcançável pela atividade
 * que ele gerou, e `/recados` segue existindo (o e-mail de lembrete aponta
 * para lá).
 *
 * O `+` não navega: abre a folha Adicionar. Fica no centro porque é a ação
 * mais frequente e o centro é onde o polegar alcança.
 */
const items = [
  { href: "/dashboard", label: "Hoje", icon: House },
  { href: "/atividades", label: "Atividades", icon: ListChecks },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/familia", label: "Família", icon: UsersRound },
];

const tabClass =
  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition-colors";

export function BottomNav({ entitlement }: { entitlement: AddEntitlement }) {
  const path = usePathname();
  // A criança escolhida viaja com a navegação. É o que o card de atalhos do
  // dashboard fazia, e é o motivo de ele ter deixado de ser necessário.
  const profileId = useSearchParams().get("perfil");
  const withProfile = (href: string) =>
    profileId && href !== "/familia" ? `${href}?perfil=${encodeURIComponent(profileId)}` : href;
  // Uma atividade vinda de recado mora sob `/recados/`, mas é uma atividade:
  // a aba acesa precisa ser a que a pessoa usou para chegar lá.
  const activePath = path.startsWith("/recados") ? "/atividades" : path;
  const isActive = (href: string) => activePath === href || activePath.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center">
        {items.slice(0, 2).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={withProfile(href)}
            aria-current={isActive(href) ? "page" : undefined}
            className={`${tabClass} ${isActive(href) ? "font-semibold text-primary-ink" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
        {/*
          A ação central é elevada, e não mais uma quinta coluna com o mesmo
          peso das abas. O gesto mais frequente do app estava escondido à vista:
          um botão de 48 px alinhado com os ícones de navegação não se lê como
          ação. Sobe 14 px acima da barra, ganha círculo, tamanho de 56 px e a
          sombra de AÇÃO (`shadow-solid-primary`). A outra ação com essa sombra
          é o "Feito!" do modo criança, numa tela que não tem rodapé — as duas
          nunca aparecem juntas. Ver ELEVAÇÃO em `globals.css`.
        */}
        <div className="flex min-h-16 flex-col items-center justify-center">
          <AddSheet
            profileId={profileId}
            entitlement={entitlement}
            label="Adicionar"
            hideLabel
            className="-mt-7 size-14 rounded-full p-0 shadow-solid-primary ring-4 ring-background transition-transform active:translate-y-0.5 active:shadow-none motion-reduce:transition-none [&_svg]:size-7"
          />
        </div>
        {items.slice(2).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={withProfile(href)}
            aria-current={isActive(href) ? "page" : undefined}
            className={`${tabClass} ${isActive(href) ? "font-semibold text-primary-ink" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
