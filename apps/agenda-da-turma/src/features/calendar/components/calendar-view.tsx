"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { TaskRow } from "@/features/unified-activities/task-repository";
import type { CalendarView as CalendarViewKind } from "../types";
import { ActivityDetailDialog } from "./activity-detail-dialog";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

type Props = {
  userId: string;
  view: CalendarViewKind;
  anchorIso: string;
  todayIso: string;
  profileFilter: string | null;
  items: TaskRow[];
  /** As atividades em aberto sem data, para a linha recolhida da semana. */
  undated: TaskRow[];
  /** O filtro de criança, montado no servidor (`ChildFilter`). */
  filter: ReactNode;
  /** Os endereços da barra, montados no servidor com a criança e a data. */
  hrefs: ComponentProps<typeof CalendarToolbar>["hrefs"];
};

// Orquestrador da aba Semana. A URL é a fonte da verdade (`?view=`, `?date=`,
// `?perfil=`), e a barra navega por links montados no servidor. Estado local
// só para a vista rápida do mês.
export function CalendarView({
  userId,
  view,
  anchorIso,
  todayIso,
  profileFilter,
  items,
  undated,
  filter,
  hrefs,
}: Props) {
  const router = useRouter();

  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailTrigger = useRef<HTMLElement | null>(null);
  // Criar é sempre o mesmo formulário. A semana só adianta o que sabe: o dia
  // tocado e a criança filtrada.
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

  const detailItem = useMemo(
    () => (detailItemId ? (items.find((row) => row.id === detailItemId) ?? null) : null),
    [items, detailItemId],
  );

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

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        anchorIso={anchorIso}
        todayIso={todayIso}
        filter={filter}
        hrefs={hrefs}
      />

      {view === "week" ? (
        <WeekView
          anchorIso={anchorIso}
          todayIso={todayIso}
          items={items}
          undated={undated}
          newActivityHref={newActivityHref}
        />
      ) : (
        <MonthView
          anchorIso={anchorIso}
          items={items}
          onSelectActivity={handleSelectActivity}
          onCreateForDay={handleCreateForDay}
          onCreateWithoutDay={() => router.push(newActivityHref())}
        />
      )}

      <ActivityDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
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
