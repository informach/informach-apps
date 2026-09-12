"use client";
import { CalendarDays, House, MailPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Rotina", icon: House },
  { href: "/recados/novo", label: "Recado", icon: MailPlus },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/familia", label: "Família", icon: UsersRound },
];
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${path === href ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
