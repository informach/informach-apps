"use client";

import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { APP_DESTINATIONS, isActiveDestination, withProfileParam } from "./destinations";

/** Os quatro destinos na barra de cima do computador, sublinhado o atual. */
export function DesktopNav() {
  const path = usePathname();
  const profileId = useSearchParams().get("perfil");
  return (
    <nav aria-label="Navegação principal" className="flex h-full items-center gap-6">
      {APP_DESTINATIONS.map((item) => {
        const active = isActiveDestination(path, item.href);
        return (
          <Link
            key={item.href}
            href={withProfileParam(item.href, profileId)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center border-b-2 px-1 text-[15px] font-bold",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-foreground/75 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
