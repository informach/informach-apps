import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { ActivityDetailShell } from "@/features/unified-activities/components/detail-shell";
import type { findExtraActivityDetailForUser } from "../repository";

/**
 * Detalhe de uma atividade extracurricular.
 *
 * Não versiona nem tem histórico — a estrutura é mais simples que as das outras
 * duas fontes. A edição continua na matéria, que é onde a família organiza
 * jazz, futebol ou reforço.
 */
export function ExtraActivityDetail({
  found,
}: {
  found: NonNullable<Awaited<ReturnType<typeof findExtraActivityDetailForUser>>>;
}) {
  const { activity } = found;
  return (
    <ActivityDetailShell profileName={found.profileName} title={activity.title}>
      <section className="space-y-3 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ACTIVITY_TYPE_LABELS[activity.type]}</Badge>
          <Badge variant="outline" className="font-normal">
            <Sparkles className="mr-1 size-3" aria-hidden />
            Extra
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{found.subjectName} · extracurricular</p>
        <p className="text-sm">Data em {activity.dueAt.split("-").reverse().join("/")}</p>
        {activity.description ? (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
            {activity.description}
          </p>
        ) : null}
        <div className="pt-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/perfis/${activity.profileId}/extras/${activity.profileSubjectId}`}>
              Abrir matéria
            </Link>
          </Button>
        </div>
      </section>
    </ActivityDetailShell>
  );
}
