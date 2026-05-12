"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ActivityFormDialog } from "@/features/activities/components/activity-form-dialog";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "@/features/activities/types";
import { shiftAnchor, todayLocalIso } from "../date";
import type { CalendarView as CalendarViewKind } from "../types";
import { ActivityDetailDialog } from "./activity-detail-dialog";
import { CalendarToolbar } from "./calendar-toolbar";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

type Profile = { id: string; name: string };

type Props = {
  userId: string;
  isPro: boolean;
  view: CalendarViewKind;
  anchorIso: string;
  profileFilter: string | null;
  profiles: Profile[];
  turmasForForm: TurmaWithSubjectsForForm[];
  items: ActivityListItem[];
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createDueAt, setCreateDueAt] = useState<string | undefined>(undefined);

  // Acha o item ativo pelo statusId (estável; `items` muda a cada
  // re-render mas o detail item escolhido fica gravado mesmo após router.refresh).
  const detailItem = useMemo(
    () => items.find((it) => it.statusId === detailItemId) ?? null,
    [items, detailItemId],
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

  const handleSelectActivity = useCallback((item: ActivityListItem) => {
    setDetailItemId(item.statusId);
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
          if (!next) setDetailItemId(null);
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
      />
    </div>
  );
}
