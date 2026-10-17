"use client";
import {
  Activity,
  Banknote,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Package,
  Users,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "./brand";

export type NavItem = {
  href: Route;
  label: string;
  icon: "painel" | "pessoas" | "produtos" | "dinheiro" | "operacao" | "auditoria";
};

const ICONS = {
  painel: LayoutGrid,
  pessoas: Users,
  produtos: Package,
  dinheiro: Banknote,
  operacao: Activity,
  auditoria: List,
};

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/entrar");
        router.refresh();
      }}
      className={`inline-flex min-h-11 items-center gap-2 text-sm font-semibold ${className}`}
    >
      <LogOut aria-hidden="true" className="size-4" />
      {pending ? "Saindo..." : "Sair"}
    </button>
  );
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="grid gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 no-underline ${
              current
                ? "bg-night-active font-bold text-white"
                : "font-semibold text-night-soft hover:bg-night-raised"
            }`}
          >
            <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Barra de baixo no celular: os quatro atalhos mais usados. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Atalhos"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line-warm bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`grid min-h-14 justify-items-center gap-0.5 pt-2 pb-3 text-xs no-underline ${
              current ? "font-bold text-sphere-strong" : "font-semibold text-ink-soft"
            }`}
          >
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu completo no celular, aberto pelo botão do topo. */
export function MobileMenu({
  items,
  who,
}: {
  items: NavItem[];
  who: { initial: string; name: string; role: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-[10px] border border-[#3A5874] text-night-ink"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu do Bastidores"
        onClose={() => setOpen(false)}
        className="on-night m-0 ml-auto h-dvh max-h-none w-[min(320px,88vw)] max-w-none bg-night p-0 text-night-ink backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <BrandMark size={30} />
              <strong className="text-[17px]">Bastidores</strong>
            </span>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="grid size-11 place-items-center rounded-[10px] border border-[#3A5874]"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <SideNav items={items} />
          <div className="mt-auto grid gap-2 rounded-[14px] bg-night-raised p-3">
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
            <SignOutButton className="text-night-ink" />
          </div>
        </div>
      </dialog>
    </>
  );
}
