"use client";

import { Button } from "@informach/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  endOfWeekIso,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  startOfWeekIso,
} from "../date";
import type { CalendarView } from "../types";

type Profile = { id: string; name: string };

type Props = {
  view: CalendarView;
  anchorIso: string;
  profileFilter: string | null;
  profiles: Profile[];
  onViewChange: (view: CalendarView) => void;
  onProfileChange: (profileId: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: () => void;
};

// Toolbar do calendário. Estado externo (URL) — esses callbacks só
// constroem hrefs no parent. Layout: prev/today/next à esquerda, label
// central, tabs+select+CTA à direita. Em mobile vira flex-wrap.
export function CalendarToolbar({
  view,
  anchorIso,
  profileFilter,
  profiles,
  onViewChange,
  onProfileChange,
  onPrev,
  onNext,
  onToday,
  onCreate,
}: Props) {
  const label =
    view === "month"
      ? formatMonthLabel(anchorIso)
      : view === "week"
        ? formatWeekRangeLabel(startOfWeekIso(anchorIso), endOfWeekIso(anchorIso))
        : formatDayLabel(anchorIso);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Período anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Próximo período">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <h2 className="flex-1 truncate text-base font-semibold tracking-tight md:text-lg">{label}</h2>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => onViewChange(v as CalendarView)}>
          <TabsList>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="day">Dia</TabsTrigger>
          </TabsList>
        </Tabs>

        {profiles.length >= 2 ? (
          <Select
            value={profileFilter ?? "all"}
            onValueChange={(v) => onProfileChange(v === "all" ? null : v)}
          >
            <SelectTrigger className="min-w-[10rem]" aria-label="Filtrar por perfil">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button onClick={onCreate} size="sm">
          <Plus className="mr-1 size-4" aria-hidden />
          Nova atividade
        </Button>
      </div>
    </div>
  );
}
