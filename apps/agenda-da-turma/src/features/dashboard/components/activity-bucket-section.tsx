"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { AlertCircle, ArrowRight, CalendarDays, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ActivityStatusValue, TurmaWithSubjectsForForm } from "@/features/activities/types";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import type { DashboardBucket } from "../types";
import { UpcomingGroupedList } from "./upcoming-grouped-list";

type Tone = "destructive" | "chart-4" | "primary";

type ToneClasses = {
  border: string;
  bg: string;
  iconBg: string;
};

type BucketMeta = {
  title: string;
  tone: Tone;
  Icon: LucideIcon;
};

const BUCKET_META: Record<DashboardBucket, BucketMeta> = {
  overdue: { title: "Atrasadas", tone: "destructive", Icon: AlertCircle },
  today: { title: "Hoje", tone: "chart-4", Icon: Clock },
  week: { title: "Próximos 7 dias", tone: "primary", Icon: CalendarDays },
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
  bucket: DashboardBucket;
  items: UnifiedActivityListItem[];
  totalCount: number;
  currentUserId: string;
  isPro: boolean;
  turmasForForm: TurmaWithSubjectsForForm[];
  /** Querystring do link "Ver todas →" — preserva filtro de perfil. */
  seeAllHref: string;
  onItemStatusSuccess?: (
    item: UnifiedActivityListItem,
    previousStatus: ActivityStatusValue,
    nextStatus: ActivityStatusValue,
  ) => void;
};

// Section reutilizado pelos 3 buckets (Atrasadas, Hoje, Próx. 7 dias).
// Não renderiza nada quando totalCount === 0.
export function ActivityBucketSection({
  bucket,
  items,
  totalCount,
  currentUserId,
  isPro,
  turmasForForm,
  seeAllHref,
  onItemStatusSuccess,
}: Props) {
  if (totalCount === 0) return null;
  const { title, tone, Icon } = BUCKET_META[bucket];
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

      {bucket === "week" ? (
        <UpcomingGroupedList
          items={items}
          currentUserId={currentUserId}
          isPro={isPro}
          turmasForForm={turmasForForm}
          onItemStatusSuccess={onItemStatusSuccess}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <UnifiedActivityCard
              key={item.source === "turma" ? item.statusId : item.activityId}
              item={item}
              currentUserId={currentUserId}
              isPro={isPro}
              turmasForForm={turmasForForm}
              hideActions
              optimisticHideWhenDone
              onStatusSuccess={onItemStatusSuccess}
            />
          ))}
        </div>
      )}
    </section>
  );
}
