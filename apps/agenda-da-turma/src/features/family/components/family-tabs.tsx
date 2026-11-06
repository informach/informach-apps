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
 *
 * No celular as quatro dividem a largura (grade de quatro colunas): numa faixa
 * que rola, "Ajustes" ficava cortado na borda em 360 px e parecia quebrado.
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
    <nav
      aria-label="Seções da família"
      className="grid grid-cols-4 gap-1.5 text-[13px] sm:flex sm:gap-2 sm:text-sm"
    >
      {SECTIONS.map(({ href, label }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-10 min-w-0 items-center justify-center rounded-full border px-1 font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] sm:shrink-0 sm:px-3.5",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 bg-background hover:bg-muted",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Cabeçalho compartilhado pelas quatro seções. Crianças não tem subtítulo: as
 * folhas das crianças dizem o que a seção é.
 */
export function FamilyHeader({ current, subtitle }: { current: FamilySection; subtitle?: string }) {
  return (
    <header className="space-y-3.5 px-1">
      <div className="space-y-1">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.04em]">Família</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <FamilyTabs current={current} />
    </header>
  );
}
