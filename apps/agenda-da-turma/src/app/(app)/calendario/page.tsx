import { getTurmasWithSubjectsForForm } from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { isValidDateIso, todayLocalIso } from "@/features/calendar/date";
import { getCalendarSnapshot } from "@/features/calendar/service";
import type { CalendarView as CalendarViewKind } from "@/features/calendar/types";
import { listStudentProfilesForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Calendário — Agenda da Turma",
};

type Props = {
  searchParams: Promise<{
    view?: string;
    date?: string;
    perfil?: string;
  }>;
};

function parseView(value: string | undefined): CalendarViewKind {
  if (value === "week" || value === "day" || value === "month") return value;
  return "month";
}

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const user = await requireUserServer();

  const view = parseView(params.view);
  const anchorIso = params.date && isValidDateIso(params.date) ? params.date : todayLocalIso();

  const [profiles, isPro, turmasForForm] = await Promise.all([
    listStudentProfilesForUser(user.id),
    getIsProForUser(user.id),
    getTurmasWithSubjectsForForm(user.id),
  ]);

  // Valida ?perfil= contra perfis do user (defensivo: ID inválido cai pra "todos").
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;

  const snapshot = await getCalendarSnapshot(user.id, { view, anchorIso, profileFilter });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Calendário</h1>
        <p className="text-sm text-muted-foreground">
          Veja as atividades dos seus perfis por mês, semana ou dia. Clique numa atividade para ver
          detalhes, ou num dia vazio para cadastrar uma nova.
        </p>
      </header>

      <CalendarView
        userId={user.id}
        isPro={isPro}
        view={view}
        anchorIso={anchorIso}
        profileFilter={profileFilter}
        profiles={profiles}
        turmasForForm={turmasForForm}
        items={snapshot.items}
      />
    </main>
  );
}
