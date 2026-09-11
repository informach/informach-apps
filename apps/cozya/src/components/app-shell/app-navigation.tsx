"use client";
import { BookOpen, CalendarDays, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Receitas", icon: BookOpen },
  { href: "/semana", label: "Semana", icon: CalendarDays },
  { href: "/compras", label: "Compras", icon: ShoppingBasket },
];
export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="mx-auto flex max-w-5xl gap-1 px-4 pb-2 print:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (href === "/dashboard" && pathname.startsWith("/receitas/"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
