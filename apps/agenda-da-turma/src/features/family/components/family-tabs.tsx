import { cn } from "@informach/ui/lib/utils";
import Link from "next/link";

/**
 * Sub-navegação da Família.
 *
 * Antes, tocar em "Família" trazia convite de segundo adulto, notificações e
 * feed de calendário — e os filhos moravam em `/perfis`, alcançável só pelo
 * menu do avatar, junto de cobrança e sair. Quem procura "meus filhos" não
 * achava. Agora Família é quem é quem: crianças primeiro.
 *
 * Pílulas com `Link`, e não `Tabs` do Radix: cada seção carrega dados próprios
 * no servidor, então navegar de verdade evita carregar os quatro conjuntos de
 * uma vez. Mesmo padrão do filtro de criança da rotina, inclusive o alvo de
 * toque de 44 px.
 */
const SECTIONS = [
  { href: "/familia", label: "Crianças" },
  { href: "/familia/turmas", label: "Turmas" },
  { href: "/familia/adultos", label: "Adultos" },
  { href: "/familia/ajustes", label: "Ajustes" },
] as const;

export type FamilySection = (typeof SECTIONS)[number]["href"];

export function FamilyTabs({ current }: { current: FamilySection }) {
  return (
    <nav aria-label="Seções da família" className="flex flex-wrap gap-2 text-sm">
      {SECTIONS.map(({ href, label }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "min-h-11 rounded-full border px-4 py-2 transition-colors",
              active
                ? "border-primary/30 bg-primary/10 font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Cabeçalho compartilhado pelas quatro seções. */
export function FamilyHeader({ current, subtitle }: { current: FamilySection; subtitle: string }) {
  return (
    <header className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Família</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <FamilyTabs current={current} />
    </header>
  );
}
