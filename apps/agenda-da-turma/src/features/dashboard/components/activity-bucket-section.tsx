import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ActivityCard } from "@/features/activities/components/activity-card";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "@/features/activities/types";

type Tone = "destructive" | "chart-4" | "primary";

type ToneClasses = {
  border: string;
  bg: string;
  iconBg: string;
};

// Mesma régua do KpiCards: classes inteiras pra o JIT do Tailwind reconhecer.
const TONE_CLASSES: Record<Tone, ToneClasses> = {
  destructive: {
    border: "border-l-destructive",
    bg: "bg-destructive/5",
    iconBg: "bg-destructive/15 text-destructive",
  },
  "chart-4": {
    border: "border-l-chart-4",
    bg: "bg-chart-4/5",
    iconBg: "bg-chart-4/15 text-chart-4",
  },
  primary: {
    border: "border-l-primary/60",
    bg: "bg-card",
    iconBg: "bg-primary/15 text-primary",
  },
};

type Props = {
  title: string;
  Icon: LucideIcon;
  tone: Tone;
  items: ActivityListItem[];
  totalCount: number;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
  /** Querystring do link "Ver todas →" — preserva filtro de perfil. */
  seeAllHref: string;
  /** Render opcional pra agrupar items (Upcoming agrupa por dia). */
  renderItems?: (items: ActivityListItem[]) => React.ReactNode;
};

// Section reutilizado pelos 3 buckets (Atrasadas, Hoje, Próx. 7 dias).
// Não renderiza nada quando totalCount === 0.
export function ActivityBucketSection({
  title,
  Icon,
  tone,
  items,
  totalCount,
  currentUserId,
  isPro,
  turmasForForm,
  seeAllHref,
  renderItems,
}: Props) {
  if (totalCount === 0) return null;
  const classes = TONE_CLASSES[tone];
  const hasMore = totalCount > items.length;

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-l-4 border-border p-4",
        classes.border,
        classes.bg,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn("flex size-8 items-center justify-center rounded-full", classes.iconBg)}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-foreground">
            {title}{" "}
            <span className="text-sm font-normal text-muted-foreground">({totalCount})</span>
          </h2>
        </div>
        {hasMore ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={seeAllHref}>
              Ver todas
              <ArrowRight className="ml-1 size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </header>

      {renderItems ? (
        renderItems(items)
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ActivityCard
              key={item.statusId}
              item={item}
              currentUserId={currentUserId}
              isPro={isPro}
              turmasForForm={turmasForForm}
              hideActions
            />
          ))}
        </div>
      )}
    </section>
  );
}
