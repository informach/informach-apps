"use client";
import { BookOpen, CalendarDays, ShoppingBasket, Utensils } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/hoje", label: "Hoje", icon: Utensils },
  { href: "/semana", label: "Semana", icon: CalendarDays },
  { href: "/compras", label: "Compras", icon: ShoppingBasket },
  { href: "/receitas", label: "Receitas", icon: BookOpen },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href === "/receitas" && pathname.startsWith("/receitas/"));
}

/**
 * The same four places, in the order of the week. Phones get them under the thumb; computers,
 * next to the logo. Only one of the two is ever rendered visible.
 */
export function AppNavigation({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  if (variant === "top")
    return (
      <nav aria-label="Navegação principal" className="hidden gap-1 md:flex print:hidden">
        {items.map(({ href, label }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-xl px-3.5 text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    );
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[76px] flex-col items-center justify-center gap-1 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "text-brand-ink" : "text-muted-foreground"}`}
          >
            <Icon className="size-[22px]" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
