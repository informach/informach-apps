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
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NothingYetIllustration } from "@/components/illustrations";
import type { AddEntitlement } from "@/features/notices/entitlement";
import type { StudentProfile } from "@/features/students/types";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  activityTypeSchema,
} from "@/features/unified-activities/activity-types";
import { ActivitySheet } from "@/features/unified-activities/components/activity-list";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  activityOverviewHref,
  DUE_WINDOW_LABELS,
  OVERVIEW_STATUS_LABELS,
  overviewStatusSchema,
} from "@/features/unified-activities/overview-types";
import { AddSheet } from "./add-sheet";

type Props = {
  items: ActivityOverviewItem[];
  hasNextPage: boolean;
  filters: ActivityOverviewOptions;
  profiles: StudentProfile[];
  activeFilter: StudentProfile | null;
  currentUserId: string;
  /** Com um adulto só, "o que é meu" nunca tiraria nada da lista. */
  hasSecondAdult: boolean;
  /** Plano e franquia do titular, para a folha Adicionar. */
  addEntitlement: AddEntitlement;
};

export function ActivitiesSection({
  items,
  hasNextPage,
  filters,
  profiles,
  activeFilter,
  currentUserId,
  hasSecondAdult,
  addEntitlement,
}: Props) {
  const router = useRouter();
  const { typeFilter, page } = filters;
  const isPaginated = page > 1;
  const manualParams = new URLSearchParams();
  if (activeFilter) manualParams.set("perfil", activeFilter.id);
  if (typeFilter) manualParams.set("tipo", typeFilter);
  const manualHref = `/atividades/nova${manualParams.size ? `?${manualParams}` : ""}`;
  const changeFilter = (next: Partial<ActivityOverviewOptions>) =>
    router.push(activityOverviewHref({ ...filters, ...next, page: 1 }));
  const handleFilterChange = (value: string) =>
    changeFilter({ profileFilter: value === "all" ? null : value });
  const handleTypeFilterChange = (value: string) => {
    const parsed = activityTypeSchema.safeParse(value);
    changeFilter({ typeFilter: parsed.success ? parsed.data : null });
  };

  const backToStartHref = activityOverviewHref({ ...filters, page: 1 });
  // O que estreita a lista além da criança escolhida. "Pendentes" é o padrão e
  // não conta; qualquer outra situação, sim.
  const hasNarrowingFilter =
    typeFilter !== null ||
    filters.dueWindow !== "all" ||
    filters.statusFilter !== "pending" ||
    filters.assignedToMe;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Um destino só. Havia dois formulários com este mesmo nome, e qual
              deles abria dependia de a criança filtrada ter turma ativa. */}
          <Button asChild>
            <Link href={manualHref}>
              <Plus className="size-4" aria-hidden />
              Nova atividade
            </Link>
          </Button>
          <AddSheet
            profileId={activeFilter?.id ?? null}
            profiles={profiles}
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
          {hasSecondAdult ? (
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button
                type="button"
                aria-pressed={filters.assignedToMe}
                onClick={() => changeFilter({ assignedToMe: !filters.assignedToMe })}
                className={`min-h-11 w-full rounded-md border px-4 text-sm transition-colors ${
                  filters.assignedToMe
                    ? "border-primary/40 bg-primary/10 font-semibold"
                    : "hover:bg-muted"
                }`}
              >
                Só o que é meu
              </button>
            </div>
          ) : null}
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
      {/*
        A janela de prazo chega pela rotina (os quatro contadores viraram link) e
        não tinha nenhuma representação aqui: a lista aparecia curta enquanto os
        três seletores diziam "Todos", e a única saída era o botão voltar do
        navegador. Pastilha removível, como a do original.
      */}
      {filters.dueWindow !== "all" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p>
            Mostrando só:{" "}
            <strong className="font-semibold">{DUE_WINDOW_LABELS[filters.dueWindow]}</strong>
          </p>
          <Link
            className="min-h-11 text-primary-ink underline"
            href={activityOverviewHref({ ...filters, dueWindow: "all", page: 1 })}
          >
            Ver todos os prazos
          </Link>
        </div>
      ) : null}
      {filters.noticeId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <p>Atividades vinculadas a um mesmo original.</p>
          <Link
            className="text-primary-ink underline"
            href={activityOverviewHref({ ...filters, noticeId: null, page: 1 })}
          >
            Remover filtro do original
          </Link>
        </div>
      ) : null}
      {items.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <NothingYetIllustration className="max-w-[170px]" />
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
                {/*
                  Só chama de "nenhuma cadastrada" quando não há recorte nenhum.
                  Com a janela de prazo ativa — e é assim que se chega aqui vindo
                  de um contador — a lista vazia dizia a uma família com quarenta
                  atividades que ela não tinha nenhuma, e não oferecia saída.
                */}
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {hasNarrowingFilter
                      ? "Nenhuma atividade com esses filtros"
                      : activeFilter
                        ? `Nenhuma atividade para ${activeFilter.name}`
                        : "Nenhuma atividade cadastrada"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hasNarrowingFilter
                      ? "Remova um filtro para ver as demais atividades."
                      : "Use Nova atividade para começar a organizar a rotina."}
                  </p>
                </div>
                {hasNarrowingFilter ? (
                  <Button asChild variant="outline">
                    <Link
                      href={activityOverviewHref({
                        ...filters,
                        typeFilter: null,
                        dueWindow: "all",
                        statusFilter: "pending",
                        assignedToMe: false,
                        page: 1,
                      })}
                    >
                      Limpar filtros
                    </Link>
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <ActivitySheet>
            {items.map((entry) => (
              <li key={entry.key}>
                <UnifiedActivityCard entry={entry} currentUserId={currentUserId} />
              </li>
            ))}
          </ActivitySheet>

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
    </div>
  );
}
