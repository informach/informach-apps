"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AddSheet } from "@/features/activities/components/add-sheet";
import type { AddEntitlement } from "@/features/notices/entitlement";
import { APP_DESTINATIONS, isActiveDestination, withProfileParam } from "./destinations";

/**
 * Quatro destinos e uma ação, no pé do celular.
 *
 * O `+` não navega: abre a folha Adicionar. Fica no centro, elevado em círculo
 * de 58 px com a borda da cor do fundo, porque é a ação mais frequente e o
 * centro é onde o polegar alcança. No computador o rodapé some e a barra de
 * cima (`DesktopHeader`) leva os mesmos destinos e o "Adicionar".
 */
export function BottomNav({
  entitlement,
  profiles,
}: {
  entitlement: AddEntitlement;
  /** Para a folha "O que chegou?" começar escolhendo a criança. */
  profiles: Array<{ id: string; name: string }>;
}) {
  const path = usePathname();
  // O rodapé chega por streaming (ver o layout) e pode hidratar depois de uma
  // navegação já começada, com outro endereço. A aba só acende depois da
  // hidratação: servidor e primeira pintura no navegador desenham igual, e o
  // React não encontra uma aba acesa no HTML e outra no cliente.
  const hydrated = useHydrated();
  // A criança escolhida viaja com a navegação.
  const profileId = useSearchParams().get("perfil");
  const [first, second, third, fourth] = APP_DESTINATIONS;
  // Trazer um recado e assinar o Pro ocupam a tela inteira, como no canvas: a
  // foto, a leitura, a revisão, o "Pronto" e o plano não têm rodapé. A saída é
  // o "Cancelar" ou o "X" de cima.
  if (path.startsWith("/recados/novo") || path === "/upgrade") return null;

  const tab = (item: (typeof APP_DESTINATIONS)[number]) => {
    const active = hydrated && isActiveDestination(path, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={withProfileParam(item.href, profileId)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 flex-col items-center justify-center gap-[3px] text-xs transition-colors",
          active
            ? "font-extrabold text-primary-ink"
            : "font-semibold text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon strokeWidth={active ? 2.2 : 2} />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid h-[72px] max-w-lg grid-cols-5 items-center">
        {first ? tab(first) : null}
        {second ? tab(second) : null}
        <div className="flex min-h-14 flex-col items-center justify-center">
          <AddSheet
            profileId={profileId}
            profiles={profiles}
            entitlement={entitlement}
            label="Adicionar"
            hideLabel
            className="-mt-[30px] size-[58px] rounded-full border-4 border-app-ground p-0 shadow-solid-primary transition-transform active:translate-y-0.5 active:shadow-none motion-reduce:transition-none [&_svg]:size-7 [&_svg]:stroke-[2.6]"
          />
        </div>
        {third ? tab(third) : null}
        {fourth ? tab(fourth) : null}
      </div>
    </nav>
  );
}
