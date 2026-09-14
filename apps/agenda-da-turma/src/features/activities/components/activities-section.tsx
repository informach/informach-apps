"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { ArrowLeft, ArrowRight, ListTodo, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AddEntitlement } from "@/features/notices/entitlement";
import type { StudentProfile } from "@/features/students/types";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  activityTypeSchema,
} from "@/features/unified-activities/activity-types";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  activityOverviewHref,
  OVERVIEW_STATUS_LABELS,
  overviewStatusSchema,
} from "@/features/unified-activities/overview-types";
import type { TurmaWithSubjectsForForm } from "../types";
import { ActivityFormDialog } from "./activity-form-dialog";
import { AddSheet } from "./add-sheet";

type Props = {
  items: ActivityOverviewItem[];
  hasNextPage: boolean;
  filters: ActivityOverviewOptions;
  profiles: StudentProfile[];
  activeFilter: StudentProfile | null;
  turmasForForm: TurmaWithSubjectsForForm[];
  currentUserId: string;
  isPro: boolean;
  /** Total de atividades já cadastradas pelo user (qualquer status). */
  activityCount: number;
  /** Plano e franquia do titular, para a folha Adicionar. */
  addEntitlement: AddEntitlement;
};

export function ActivitiesSection({
  items,
  hasNextPage,
  filters,
  profiles,
  activeFilter,
  turmasForForm,
  currentUserId,
  isPro,
  activityCount,
  addEntitlement,
}: Props) {
  const router = useRouter();
  const { typeFilter, page } = filters;
  const isPaginated = page > 1;
  const manualParams = new URLSearchParams();
  if (activeFilter) manualParams.set("perfil", activeFilter.id);
  if (typeFilter) manualParams.set("tipo", typeFilter);
  const manualHref = `/atividades/nova${manualParams.size ? `?${manualParams}` : ""}`;
  const schoolType = activityTypeSchema.safeParse(typeFilter);
  const [createOpen, setCreateOpen] = useState(false);
  const changeFilter = (next: Partial<ActivityOverviewOptions>) =>
    router.push(activityOverviewHref({ ...filters, ...next, page: 1 }));
  const handleFilterChange = (value: string) =>
    changeFilter({ profileFilter: value === "all" ? null : value });
  const handleTypeFilterChange = (value: string) => {
    const parsed = activityTypeSchema.safeParse(value);
    changeFilter({ typeFilter: parsed.success ? parsed.data : null });
  };

  const canCreate = turmasForForm.length > 0;
  const canCreateForSelection =
    canCreate &&
    (!activeFilter || turmasForForm.some((turma) => turma.turmaId === activeFilter.activeTurmaId));
  const backToStartHref = activityOverviewHref({ ...filters, page: 1 });

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              if (canCreateForSelection && (!typeFilter || schoolType.success)) setCreateOpen(true);
              else router.push(manualHref);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Nova atividade
          </Button>
          <AddSheet
            profileId={activeFilter?.id ?? null}
            entitlement={addEntitlement}
            label="Adicionar de um recado"
            icon="sparkles"
            variant="outline"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="activities-profile-filter" className="text-sm text-muted-foreground">
              Estudante
            </label>
            <Select value={activeFilter?.id ?? "all"} onValueChange={handleFilterChange}>
              <SelectTrigger id="activities-profile-filter" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="activities-type-filter" className="text-sm text-muted-foreground">
              Tipo de atividade
            </label>
            <Select value={typeFilter ?? "all"} onValueChange={handleTypeFilterChange}>
              <SelectTrigger id="activities-type-filter" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {ACTIVITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ACTIVITY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <label htmlFor="activities-status-filter" className="text-sm text-muted-foreground">
              Situação
            </label>
            <Select
              value={filters.statusFilter}
              onValueChange={(value) => {
                const parsed = overviewStatusSchema.safeParse(value);
                if (parsed.success) changeFilter({ statusFilter: parsed.data });
              }}
            >
              <SelectTrigger id="activities-status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {overviewStatusSchema.options.map((status) => (
                  <SelectItem key={status} value={status}>
                    {OVERVIEW_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {filters.noticeId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <p>Atividades vinculadas a um mesmo original.</p>
          <Link
            className="text-primary underline"
            href={activityOverviewHref({ ...filters, noticeId: null, page: 1 })}
          >
            Remover filtro do original
          </Link>
        </div>
      ) : null}
      {items.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListTodo className="size-6" aria-hidden />
            </span>
            {isPaginated ? (
              <>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">Você chegou ao fim</p>
                  <p className="text-sm text-muted-foreground">
                    Não há mais atividades nesta seleção.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={backToStartHref}>
                    <ArrowLeft className="mr-2 size-4" aria-hidden />
                    Voltar ao início
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {typeFilter
                      ? "Nenhuma atividade com esses filtros"
                      : activeFilter
                        ? `Nenhuma atividade para ${activeFilter.name}`
                        : "Nenhuma atividade cadastrada"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {typeFilter
                      ? "Escolha outro tipo ou remova o filtro para ver as demais atividades."
                      : "Use Nova atividade para começar a organizar a rotina."}
                  </p>
                </div>
                {typeFilter ? (
                  <Button asChild variant="outline">
                    <Link href={activityOverviewHref({ ...filters, typeFilter: null, page: 1 })}>
                      Ver todos os tipos
                    </Link>
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((entry) => (
              <UnifiedActivityCard
                key={entry.key}
                entry={entry}
                currentUserId={currentUserId}
                isPro={isPro}
                turmasForForm={turmasForForm}
              />
            ))}
          </div>

          {(hasNextPage || isPaginated) && (
            <footer className="flex items-center justify-between pt-2">
              {isPaginated ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={backToStartHref}>
                    <ArrowLeft className="mr-2 size-4" aria-hidden />
                    Voltar ao início
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              {hasNextPage ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={activityOverviewHref({ ...filters, page: page + 1 })}>
                    Próxima página
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </footer>
          )}
        </>
      )}

      <ActivityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        turmas={turmasForForm}
        isPro={isPro}
        currentActivityCount={activityCount}
        manualHref={manualHref}
        defaultType={schoolType.success ? schoolType.data : undefined}
        defaultTurmaId={activeFilter?.activeTurmaId ?? undefined}
      />
    </div>
  );
}
