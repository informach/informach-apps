import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { firstName, type Staff } from "@/lib/access";
import { Brand, BrandMark } from "./brand";
import { BottomNav, MobileMenu, type NavItem, SideNav, SignOutButton } from "./nav";

function navItems(staff: Staff): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Painel", icon: "painel" },
    { href: "/pessoas", label: "Pessoas", icon: "pessoas" },
    { href: "/produtos", label: "Produtos", icon: "produtos" },
  ];
  // Dinheiro e receita ficam só com as contas owner (decisão da proposta).
  if (staff.role === "owner")
    items.push({ href: "/dinheiro", label: "Dinheiro", icon: "dinheiro" });
  items.push(
    { href: "/operacao", label: "Operação", icon: "operacao" },
    { href: "/auditoria", label: "Auditoria", icon: "auditoria" },
  );
  return items;
}

function roleLine(staff: Staff) {
  return staff.role === "owner" ? "papel owner" : "suporte · papel admin";
}

export function Shell({ staff, children }: { staff: Staff; children: ReactNode }) {
  const items = navItems(staff);
  const shortcuts = items.filter((item) =>
    ["/", "/pessoas", staff.role === "owner" ? "/dinheiro" : "/produtos", "/operacao"].includes(
      item.href,
    ),
  );
  const who = {
    initial: firstName(staff).charAt(0).toUpperCase(),
    name: firstName(staff),
    role: roleLine(staff),
  };

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Ir para o conteúdo
      </a>

      <nav
        aria-label="Menu do Bastidores"
        className="on-night hidden w-[248px] shrink-0 flex-col gap-7 bg-night px-4 py-6 text-night-ink lg:sticky lg:top-0 lg:flex lg:h-dvh"
      >
        <div className="px-2">
          <Brand />
        </div>
        <SideNav items={items} />
        <div className="mt-auto grid gap-3 rounded-[14px] bg-night-raised px-3 py-4">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full bg-paper text-sm font-extrabold text-night"
            >
              {who.initial}
            </span>
            <span className="grid leading-tight">
              <strong className="text-sm">{who.name}</strong>
              <span className="text-xs text-night-muted">{who.role}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs text-night-muted">
            <Eye aria-hidden="true" className="size-3.5" />
            Cada consulta fica registrada.
          </span>
          <SignOutButton className="text-night-ink" />
        </div>
      </nav>

      <header className="on-night sticky top-0 z-20 flex items-center justify-between gap-3 bg-night px-4 py-3.5 text-night-ink lg:hidden">
        <span className="flex items-center gap-2.5">
          <BrandMark size={30} />
          <strong className="text-[17px]">Bastidores</strong>
        </span>
        <MobileMenu items={items} who={who} />
      </header>

      <main
        id="conteudo"
        className="grid min-w-0 flex-1 content-start gap-7 px-4 pt-6 pb-28 sm:px-[clamp(16px,3vw,40px)] lg:pt-7 lg:pb-14"
      >
        {children}
      </main>

      <BottomNav items={shortcuts} />
    </div>
  );
}
