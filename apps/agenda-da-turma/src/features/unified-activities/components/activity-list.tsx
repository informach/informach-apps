import { cn } from "@informach/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A folha onde as atividades viram linhas de agenda.
 *
 * O card deixou de ter borda e fundo próprios: cada um pintava a cor da
 * matéria no fundo inteiro e a lista virava um mural de adesivos, sem
 * hierarquia. Agora a folha é uma só, no `background`, e cada atividade é uma
 * linha separada por um fio. O título da folha ("Para hoje", "Amanhã, terça")
 * é opcional; sem ele, a primeira linha não desenha o fio de cima.
 */
export function ActivitySheet({
  title,
  aside,
  footer,
  children,
  className,
  labelledBy,
}: {
  title?: ReactNode;
  /** Ao lado do título: contagem, atalho. */
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "overflow-hidden rounded-[20px] border border-foreground/15 bg-background",
        className,
      )}
    >
      {title ? (
        <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-4 sm:px-5">
          <h2 id={labelledBy} className="text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          {aside ? (
            <div className="shrink-0 text-sm font-semibold text-muted-foreground">{aside}</div>
          ) : null}
        </div>
      ) : null}
      <ul className={cn("flex flex-col", !title && "[&>li:first-child_article]:border-t-0")}>
        {children}
      </ul>
      {footer ? (
        <div className="border-t border-foreground/15 px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </section>
  );
}
