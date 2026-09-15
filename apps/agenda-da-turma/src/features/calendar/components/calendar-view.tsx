"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
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
  items: ActivityOverviewItem[];
};

// Orquestrador do calendário. URL é a fonte da verdade (`?view=`, `?date=`,
// `?perfil=`). Navegação usa `router.replace` com scroll: false pra não
// pular pro topo entre meses. Estado local mantido apenas pra dialogs.
export function CalendarView({
  userId,
  addEntitlement,
  view,
  anchorIso,
  profileFilter,
  profiles,
  items,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailTrigger = useRef<HTMLElement | null>(null);
  // Criar é sempre o mesmo formulário. O calendário só adianta o que sabe: o
  // dia tocado e a criança filtrada.
  const newActivityHref = useCallback(
    (iso?: string) => {
      const params = new URLSearchParams();
      if (iso) params.set("data", iso);
      if (profileFilter) params.set("perfil", profileFilter);
      const query = params.toString();
      return query ? `/atividades/nova?${query}` : "/atividades/nova";
    },
    [profileFilter],
  );

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

  const handleCreateForDay = useCallback(
    (iso: string) => router.push(newActivityHref(iso)),
    [router, newActivityHref],
  );

  const handleCreateGlobal = () => router.push(newActivityHref());

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        anchorIso={anchorIso}
        profileFilter={profileFilter}
        profiles={profiles}
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
    </div>
  );
}
