import { cn } from "@informach/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * As peças da página de vendas, com as medidas da prancha "Página de vendas"
 * do canvas: a largura de 1200 px com 40 px de margem (20 no celular), as
 * seções de 112 px (72 no celular), o título de seção que vai de 34 a 56 px e
 * o texto de abertura de 19 px. Em classes do Tailwind e com os tokens do app,
 * para a página e o app falarem a mesma língua.
 */
export const WRAP = "mx-auto box-border w-full max-w-[1200px] px-5 min-[761px]:px-10";
export const SEC = "scroll-mt-20 py-[72px] min-[761px]:py-28";
/** Uma seção com o fundo claro e as linhas em cima e embaixo, alternando com o fundo da página. */
export const SEC_LIGHT = "border-y border-foreground/15 bg-background";
export const EYEBROW = "text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink";
export const H2 =
  "m-0 text-balance text-[clamp(34px,4.2vw,56px)] font-extrabold leading-[1.04] tracking-[-0.035em]";
export const LEAD = "text-pretty text-[19px] leading-[1.6] text-foreground/85";
export const GRID2 =
  "grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-center gap-14";
export const GRID3 = "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5";
export const BTN =
  "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-primary px-[26px] text-[17px] font-bold text-primary-foreground no-underline shadow-solid-primary hover:bg-[color-mix(in_oklch,var(--primary)_88%,var(--foreground))] disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none";
export const BTN2 =
  "inline-flex min-h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-foreground px-[22px] text-base font-bold text-foreground no-underline hover:bg-foreground/5";
export const SHEET = "rounded-[22px] border border-foreground/15 bg-background";
export const CHIP =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold";
export const DOT = "inline-block size-[9px] shrink-0 rounded-full";
/** A linha das listas de exemplo (`.row` da prancha). */
export const ROW = "flex items-center gap-3 border-t border-foreground/15 px-4 py-3";
export const META =
  "mt-[3px] flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground";
/** O círculo de concluir, só desenhado: nas telas de exemplo nada se marca. */
export const CHECK = "size-6 shrink-0 rounded-full border-2 border-foreground/35";

/**
 * O celular das ilustrações: uma tela de 390 px desenhada em tamanho real e
 * reduzida por `scale`, dentro da moldura preta. As telas são de exemplo, com
 * nomes de exemplo, e não fotos do app de alguém.
 */
export function Phone({
  className,
  scale = 0.72,
  screenClassName,
  children,
  label,
}: {
  className?: string;
  scale?: number;
  screenClassName?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      {...(label ? { role: "img", "aria-label": label } : {})}
      className={cn(
        "box-border h-[620px] w-[300px] shrink-0 overflow-hidden rounded-[44px] border-[10px] border-foreground bg-app-ground",
        className,
      )}
    >
      <div
        className={cn("h-[820px] w-[390px] origin-top-left text-base", screenClassName)}
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
