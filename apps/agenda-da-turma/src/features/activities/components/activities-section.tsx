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
import type { StudentProfile } from "@/features/students/types";
import type { ActivityListItem, ParsedActivityInput, TurmaWithSubjectsForForm } from "../types";
import { ActivitiesBatchConfirmDialog } from "./activities-batch-confirm-dialog";
import { ActivityCard } from "./activity-card";
import { ActivityFormDialog } from "./activity-form-dialog";
import { ActivityImageDialog } from "./activity-image-dialog";
import { ActivityPdfDialog } from "./activity-pdf-dialog";
import { ActivityVoiceDialog } from "./activity-voice-dialog";
import { TurmaConfirmDialog } from "./turma-confirm-dialog";

type Props = {
  items: ActivityListItem[];
  /** Cursor pra próxima página; null no fim. */
  nextCursor: string | null;
  /** True quando a URL já tem ?cursor= — sinaliza que o user navegou pra page > 1. */
  isPaginated: boolean;
  profiles: StudentProfile[];
  activeFilter: StudentProfile | null;
  turmasForForm: TurmaWithSubjectsForForm[];
  currentUserId: string;
  isPro: boolean;
  /** Total de atividades já cadastradas pelo user (qualquer status). */
  activityCount: number;
};

// Monta `/atividades?perfil=X&cursor=Y` filtrando params nulos. Cursor null
// retorna ao começo (primeira página); perfil null retorna pra "Todos".
function buildAtividadesHref({
  perfil,
  cursor,
}: {
  perfil: string | null;
  cursor: string | null;
}): string {
  const params = new URLSearchParams();
  if (perfil) params.set("perfil", perfil);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/atividades?${qs}` : "/atividades";
}

export function ActivitiesSection({
  items,
  nextCursor,
  isPaginated,
  profiles,
  activeFilter,
  turmasForForm,
  currentUserId,
  isPro,
  activityCount,
}: Props) {
  const router = useRouter();
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

  const handleFilterChange = (value: string) => {
    // Trocar de perfil reseta cursor — começa de novo na página 1.
    if (value === "all") {
      router.push("/atividades");
    } else {
      router.push(`/atividades?perfil=${value}`);
    }
  };

  if (profiles.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListTodo className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Crie um perfil de estudante primeiro
            </p>
            <p className="text-sm text-muted-foreground">
              Cada atividade fica vinculada a um perfil — você precisa ter pelo menos um.
            </p>
          </div>
          <Button asChild>
            <Link href="/perfis">Criar perfil</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canCreate = turmasForForm.length > 0;
  const filterPerfilId = activeFilter?.id ?? null;
  const backToStartHref = buildAtividadesHref({ perfil: filterPerfilId, cursor: null });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Filtro à esquerda no desktop, primeira linha no mobile. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtrar por estudante:</span>
          <Select value={activeFilter?.id ?? "all"} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-auto min-w-[180px]">
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

        {/* Ações à direita no desktop, embaixo no mobile.
            Os 4 botões ficam explícitos (com Pro badges visíveis) para
            incentivar conversão Free → Pro. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setCreateOpen(true)} disabled={!canCreate}>
            <Plus className="mr-2 size-4" aria-hidden />
            Nova atividade
          </Button>
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
            Por PDF
            {!isPro ? (
              <Badge variant="secondary" className="ml-2">
                Pro
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      {!canCreate ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListTodo className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Vincule um perfil a uma turma ativa
              </p>
              <p className="text-sm text-muted-foreground">
                As atividades pertencem a uma turma. Cadastre uma matéria também para começar a
                criar atividades.
              </p>
            </div>
            <Button asChild>
              <Link href="/turmas">Ir para turmas</Link>
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
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
                    {activeFilter
                      ? `Nenhuma atividade para ${activeFilter.name}`
                      : "Nenhuma atividade cadastrada"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Adicione tarefas, provas, trabalhos ou lembretes pra organizar a rotina.
                  </p>
                </div>
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 size-4" aria-hidden />
                  Nova atividade
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ActivityCard
                key={item.statusId}
                item={item}
                currentUserId={currentUserId}
                isPro={isPro}
                turmasForForm={turmasForForm}
              />
            ))}
          </div>

          {/* Footer de paginação — forward-only (keyset cursor).
              "Voltar ao início" reseta cursor sem perder filtro de perfil. */}
          {(nextCursor || isPaginated) && (
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
              {nextCursor ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildAtividadesHref({ perfil: filterPerfilId, cursor: nextCursor })}>
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
