"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { ArrowLeft, ArrowRight, Camera, FileText, ListTodo, Mic, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { RoutineCard } from "@/features/notices/components/routine-card";
import { ACTION_LABELS, ACTION_TYPES } from "@/features/notices/schemas";
import type { StudentProfile } from "@/features/students/types";
import { UnifiedActivityCard } from "@/features/unified-activities/components/unified-activity-card";
import {
  type ActivityOverviewItem,
  type ActivityOverviewOptions,
  activityOverviewHref,
  OVERVIEW_STATUS_LABELS,
  overviewStatusSchema,
} from "@/features/unified-activities/overview-types";
import { activityTypeSchema } from "../schemas";
import type { ParsedActivityInput, TurmaWithSubjectsForForm } from "../types";
import { ActivitiesBatchConfirmDialog } from "./activities-batch-confirm-dialog";
import { ActivityFormDialog } from "./activity-form-dialog";
import { ActivityImageDialog } from "./activity-image-dialog";
import { ActivityPdfDialog } from "./activity-pdf-dialog";
import { ActivityVoiceDialog } from "./activity-voice-dialog";
import { TurmaConfirmDialog } from "./turma-confirm-dialog";

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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  // Passo intermediário entre voz/imagem/PDF e batch confirm: o user confirma
  // (ou escolhe) a turma do batch. As atividades parseadas ficam "presas" em
  // `pendingActivities` até a confirmação acontecer.
  const [pendingActivities, setPendingActivities] = useState<ParsedActivityInput[] | null>(null);
  const [pendingGuessedTurmaId, setPendingGuessedTurmaId] = useState<string | null>(null);
  const [batchInitial, setBatchInitial] = useState<ParsedActivityInput[] | null>(null);
  const [batchTurmaId, setBatchTurmaId] = useState<string | null>(null);

  // Fecha o dialog de origem (voz/imagem/PDF) e abre o passo intermediário
  // de confirmação de turma. O batch confirm só abre depois que o user
  // confirma.
  const handleParsed = (parsed: ParsedActivityInput[], guessedTurmaId: string | null) => {
    setVoiceOpen(false);
    setImageOpen(false);
    setPdfOpen(false);
    setPendingActivities(parsed);
    setPendingGuessedTurmaId(guessedTurmaId);
  };

  const handleConfirmTurma = (turmaId: string) => {
    setBatchInitial(pendingActivities);
    setBatchTurmaId(turmaId);
    setPendingActivities(null);
    setPendingGuessedTurmaId(null);
  };

  const changeFilter = (next: Partial<ActivityOverviewOptions>) =>
    router.push(activityOverviewHref({ ...filters, ...next, page: 1 }));
  const handleFilterChange = (value: string) =>
    changeFilter({ profileFilter: value === "all" ? null : value });
  const handleTypeFilterChange = (value: string) => {
    const parsed = z.enum(ACTION_TYPES).safeParse(value);
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
          <Button asChild variant="outline">
            <Link href={activeFilter ? `/recados/novo?perfil=${activeFilter.id}` : "/recados/novo"}>
              <Camera className="size-4" aria-hidden /> Importar mensagem ou foto
            </Link>
          </Button>
          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm">Ferramentas por matéria</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVoiceOpen(true)}
                disabled={!isPro || !canCreate}
              >
                <Mic className="mr-2 size-4" aria-hidden />
                Por voz
                {!isPro ? (
                  <Badge variant="secondary" className="ml-2">
                    Pro
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImageOpen(true)}
                disabled={!isPro || !canCreate}
              >
                <Camera className="mr-2 size-4" aria-hidden />
                Por imagem
                {!isPro ? (
                  <Badge variant="secondary" className="ml-2">
                    Pro
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPdfOpen(true)}
                disabled={!isPro || !canCreate}
              >
                <FileText className="mr-2 size-4" aria-hidden />
                PDF por matéria
                {!isPro ? (
                  <Badge variant="secondary" className="ml-2">
                    Pro
                  </Badge>
                ) : null}
              </Button>
            </div>
          </details>
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
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "task" ? "Para casa (tarefa)" : ACTION_LABELS[type]}
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
            {items.map((entry) =>
              entry.source === "notice" ? (
                <RoutineCard key={entry.key} item={entry.item} />
              ) : (
                <UnifiedActivityCard
                  key={entry.key}
                  item={entry.source === "turma" ? { ...entry.item, source: "turma" } : entry.item}
                  currentUserId={currentUserId}
                  isPro={isPro}
                  turmasForForm={turmasForForm}
                />
              ),
            )}
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

      {isPro ? (
        <>
          <ActivityVoiceDialog
            open={voiceOpen}
            onOpenChange={setVoiceOpen}
            onParsed={handleParsed}
          />
          <ActivityImageDialog
            open={imageOpen}
            onOpenChange={setImageOpen}
            onParsed={handleParsed}
          />
          <ActivityPdfDialog open={pdfOpen} onOpenChange={setPdfOpen} onParsed={handleParsed} />
          <TurmaConfirmDialog
            open={pendingActivities !== null}
            onOpenChange={(o) => {
              if (!o) {
                setPendingActivities(null);
                setPendingGuessedTurmaId(null);
              }
            }}
            turmas={turmasForForm}
            profiles={profiles}
            guessedTurmaId={pendingGuessedTurmaId}
            onConfirm={handleConfirmTurma}
          />
          <ActivitiesBatchConfirmDialog
            open={batchInitial !== null}
            onOpenChange={(o) => {
              if (!o) {
                setBatchInitial(null);
                setBatchTurmaId(null);
              }
            }}
            turmas={turmasForForm}
            isPro={isPro}
            initialActivities={batchInitial ?? []}
            lockedTurmaId={batchTurmaId ?? undefined}
          />
        </>
      ) : null}
    </div>
  );
}
