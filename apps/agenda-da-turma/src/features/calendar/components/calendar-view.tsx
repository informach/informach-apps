"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityFormDialog } from "@/features/activities/components/activity-form-dialog";
import type { TurmaWithSubjectsForForm } from "@/features/activities/types";
import type { AddEntitlement } from "@/features/notices/entitlement";
import type { StudentProfile } from "@/features/students/types";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import type { TaskRow } from "@/features/unified-activities/task-repository";
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
  /** Plano e franquia do titular, para a folha Adicionar. */
  addEntitlement: AddEntitlement;
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
  items: ActivityOverviewItem[];
};

// Orquestrador do calendário. URL é a fonte da verdade (`?view=`, `?date=`,
// `?perfil=`). Navegação usa `router.replace` com scroll: false pra não
// pular pro topo entre meses. Estado local mantido apenas pra dialogs.
export function CalendarView({
  userId,
  isPro,
  addEntitlement,
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

  // Uma tabela, um id: a chave composta por origem deixou de ser necessária.
  const rows = useMemo(() => items.map((entry) => entry.item), [items]);
  const detailItem = useMemo(
    () => (detailItemId ? (rows.find((row) => row.id === detailItemId) ?? null) : null),
    [rows, detailItemId],
  );

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

  const handleSelectActivity = useCallback((item: TaskRow) => {
    detailTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailItemId(item.id);
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

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        anchorIso={anchorIso}
        profileFilter={profileFilter}
        profiles={profiles}
        canCreate={canCreate}
        addEntitlement={addEntitlement}
        onViewChange={handleViewChange}
        onProfileChange={handleProfileChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onCreate={handleCreateGlobal}
      />

      {view === "month" ? (
        <MonthView
          anchorIso={anchorIso}
          items={rows}
          onSelectActivity={handleSelectActivity}
          onCreateForDay={handleCreateForDay}
        />
      ) : view === "week" ? (
        <WeekView
          anchorIso={anchorIso}
          items={rows}
          onSelectActivity={handleSelectActivity}
          onCreateForDay={handleCreateForDay}
        />
      ) : (
        <DayView
          anchorIso={anchorIso}
          items={items}
          currentUserId={userId}
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
      />

      <ActivityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        turmas={turmasForForm}
        isPro={isPro}
        defaultDueAt={createDueAt}
        defaultTurmaId={defaultTurmaIdFromProfile}
      />
    </div>
  );
}
