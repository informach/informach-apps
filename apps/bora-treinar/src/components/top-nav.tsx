"use client";
import { ChartNoAxesColumn, Dumbbell, House, Settings, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./avatar";

const TABS = [
  { href: "/inicio", label: "Início", icon: House },
  { href: "/exercicios", label: "Exercícios", icon: Dumbbell },
  { href: "/desafios", label: "Desafios", icon: Trophy },
  { href: "/progresso", label: "Progresso", icon: ChartNoAxesColumn },
] as const;

export function TopNav({ profile }: { profile: { name: string; color: string } }) {
  const path = usePathname();
  return (
    <header className="topbar">
      <Link href="/inicio" className="brand">
        <i />
        Bora Treinar
      </Link>
      <span className="spacer" />
      <nav className="tabs" aria-label="Seções">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="tab"
            aria-current={path.startsWith(t.href) ? "page" : undefined}
          >
            <t.icon size={18} />
            {t.label}
          </Link>
        ))}
      </nav>
      <span className="spacer" />
      <Link href="/conta" className="icon-btn" aria-label="Conta e plano" title="Conta e plano">
        <Settings size={20} />
      </Link>
      <Link href="/perfis" className="tab" title="Trocar perfil" aria-label="Trocar perfil">
        <Avatar profile={profile} />
      </Link>
    </header>
  );
}
