"use client";
import { CalendarDays, House, ListChecks, Mail, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Rotina", icon: House },
  { href: "/atividades", label: "Atividades", icon: ListChecks },
  { href: "/recados", label: "Recados", icon: Mail },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/familia", label: "Família", icon: UsersRound },
];
export function BottomNav() {
  const path = usePathname();
  const activePath = path.startsWith("/recados/acoes/") ? "/atividades" : path;
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              activePath === href || activePath.startsWith(`${href}/`) ? "page" : undefined
            }
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${activePath === href || activePath.startsWith(`${href}/`) ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
