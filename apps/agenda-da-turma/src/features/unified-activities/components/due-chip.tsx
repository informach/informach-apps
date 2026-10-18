import { cn } from "@informach/ui/lib/utils";
import type { DueLabel, DueTone } from "../due";

/**
 * Peso e preenchimento separam os estados, não só a cor: quem não distingue o
 * vermelho ainda lê "Passou" escrito, e "Hoje" preenchido se destaca de
 * "Amanhã" contornado mesmo em escala de cinza.
 */
const TONE_CLASS: Record<DueTone, string> = {
  late: "bg-destructive/15 text-destructive-ink",
  today: "bg-foreground text-background",
  tomorrow: "border-[1.5px] border-foreground text-foreground",
  later: "border border-foreground/15 text-foreground",
  none: "bg-muted text-muted-foreground",
  done: "bg-chart-2/15 text-chart-2-ink",
  canceled: "bg-muted text-muted-foreground line-through",
};

export function DueChip({ due, className }: { due: DueLabel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold tabular-nums",
        TONE_CLASS[due.tone],
        className,
      )}
    >
      {due.label}
    </span>
  );
}
