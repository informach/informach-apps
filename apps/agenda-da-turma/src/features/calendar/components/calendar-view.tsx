"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivitiesBatchConfirmDialog } from "@/features/activities/components/activities-batch-confirm-dialog";
import { ActivityFormDialog } from "@/features/activities/components/activity-form-dialog";
import { ActivityImageDialog } from "@/features/activities/components/activity-image-dialog";
import { ActivityPdfDialog } from "@/features/activities/components/activity-pdf-dialog";
import { ActivityVoiceDialog } from "@/features/activities/components/activity-voice-dialog";
import { TurmaConfirmDialog } from "@/features/activities/components/turma-confirm-dialog";
import type { ParsedActivityInput, TurmaWithSubjectsForForm } from "@/features/activities/types";
import type { StudentProfile } from "@/features/students/types";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { shiftAnchor, todayLocalIso } from "../date";
import type { CalendarView as CalendarViewKind } from "../types";
import { ActivityDetailDialog } from "./activity-detail-dialog";
import { CalendarToolbar } from "./calendar-toolbar";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

type Props = {
  userId: string;
  isPro: boolean;
  view: CalendarViewKind;
  anchorIso: string;
  profileFilter: string | null;
  /**
   * Perfis completos do user — toolbar consome só `id`/`name`, mas o
   * `TurmaConfirmDialog` precisa de `activeTurmaId` pra casar perfil ↔ turma
   * vencedora.
   */
  profiles: StudentProfile[];
  turmasForForm: TurmaWithSubjectsForForm[];
  items: UnifiedActivityListItem[];
};

// Orquestrador do calendário. URL é a fonte da verdade (`?view=`, `?date=`,
// `?perfil=`). Navegação usa `router.replace` com scroll: false pra não
// pular pro topo entre meses. Estado local mantido apenas pra dialogs.
export function CalendarView({
  userId,
  isPro,
  view,
  anchorIso,
  profileFilter,
  profiles,
  turmasForForm,
  items,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDueAt, setCreateDueAt] = useState<string | undefined>(undefined);

  // Mesma máquina de estado de `activities-section.tsx` pra fluxo
  // voz/imagem/PDF: dialog de origem → turma confirm (se IA não chutou) →
  // batch confirm.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pendingActivities, setPendingActivities] = useState<ParsedActivityInput[] | null>(null);
  const [pendingGuessedTurmaId, setPendingGuessedTurmaId] = useState<string | null>(null);
  const [batchInitial, setBatchInitial] = useState<ParsedActivityInput[] | null>(null);
  const [batchTurmaId, setBatchTurmaId] = useState<string | null>(null);

  const canCreate = turmasForForm.length > 0;

  // Quando o user tem um perfil filtrado, a `activeTurmaId` desse perfil é
  // o default natural pra qualquer atividade nova criada pela toolbar/grid —
  // tanto o clique num dia vazio quanto o botão global "Nova atividade".
  // Quando o perfil não tem turma ativa, fica null e o form continua exigindo
  // seleção manual. Quando não há filtro, idem.
  const defaultTurmaIdFromProfile = useMemo(() => {
    if (!profileFilter) return undefined;
    const matched = profiles.find((p) => p.id === profileFilter);
    return matched?.activeTurmaId ?? undefined;
  }, [profileFilter, profiles]);

  // Acha o item ativo pela chave estável da origem. Turma usa `statusId`
  // (atividade × perfil), extras usam `activityId` (1 row = 1 atividade).
  // detailItemId é prefixado com "turma:" ou "extra:" pra evitar colisão.
  const detailItem = useMemo(() => {
    if (!detailItemId) return null;
    const [origin, key] = detailItemId.split(":");
    return (
      items.find((it) => {
        if (it.source === "turma" && origin === "turma") return it.statusId === key;
        if (it.source === "extra" && origin === "extra") return it.activityId === key;
        if (it.source === "notice" && origin === "notice") return it.activityId === key;
        return false;
      }) ?? null
    );
  }, [items, detailItemId]);

  const buildHref = useCallback(
    (next: { view?: CalendarViewKind; date?: string; perfil?: string | null }) => {
      const params = new URLSearchParams(searchParams?.toString());
      if (next.view !== undefined) params.set("view", next.view);
      if (next.date !== undefined) params.set("date", next.date);
      if (next.perfil !== undefined) {
        if (next.perfil === null) params.delete("perfil");
        else params.set("perfil", next.perfil);
      }
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  const navigate = useCallback(
    (next: { view?: CalendarViewKind; date?: string; perfil?: string | null }) => {
      router.replace(buildHref(next), { scroll: false });
    },
    [router, buildHref],
  );

  const handlePrev = () => navigate({ date: shiftAnchor(anchorIso, view, -1) });
  const handleNext = () => navigate({ date: shiftAnchor(anchorIso, view, 1) });
  const handleToday = () => navigate({ date: todayLocalIso() });
  const handleViewChange = (next: CalendarViewKind) => navigate({ view: next });
  const handleProfileChange = (next: string | null) => navigate({ perfil: next });

  const handleSelectActivity = useCallback((item: UnifiedActivityListItem) => {
    detailTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const key =
      item.source === "turma" ? `turma:${item.statusId}` : `${item.source}:${item.activityId}`;
    setDetailItemId(key);
    setDetailOpen(true);
  }, []);

  const handleCreateForDay = useCallback((iso: string) => {
    setCreateDueAt(iso);
    setCreateOpen(true);
  }, []);

  const handleCreateGlobal = () => {
    setCreateDueAt(undefined);
    setCreateOpen(true);
  };

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

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        anchorIso={anchorIso}
        profileFilter={profileFilter}
        profiles={profiles}
        canCreate={canCreate}
        isPro={isPro}
        onViewChange={handleViewChange}
        onProfileChange={handleProfileChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onCreate={handleCreateGlobal}
        onCreateByVoice={() => setVoiceOpen(true)}
        onCreateByImage={() => setImageOpen(true)}
        onCreateByPdf={() => setPdfOpen(true)}
      />

      {view === "month" ? (
        <MonthView
          anchorIso={anchorIso}
          items={items}
          onSelectActivity={handleSelectActivity}
          onCreateForDay={handleCreateForDay}
        />
      ) : view === "week" ? (
        <WeekView
          anchorIso={anchorIso}
          items={items}
          onSelectActivity={handleSelectActivity}
          onCreateForDay={handleCreateForDay}
        />
      ) : (
        <DayView
          anchorIso={anchorIso}
          items={items}
          currentUserId={userId}
          isPro={isPro}
          turmasForForm={turmasForForm}
          onCreateForDay={handleCreateForDay}
        />
      )}

      <ActivityDetailDialog
        open={detailOpen}
        onOpenChange={(next) => {
          setDetailOpen(next);
        }}
        onCloseAutoFocus={(event) => {
          if (detailTrigger.current?.isConnected) {
            event.preventDefault();
            detailTrigger.current.focus();
          }
        }}
        item={detailItem}
        currentUserId={userId}
        isPro={isPro}
        turmasForForm={turmasForForm}
      />

      <ActivityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        turmas={turmasForForm}
        isPro={isPro}
        defaultDueAt={createDueAt}
        defaultTurmaId={defaultTurmaIdFromProfile}
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
