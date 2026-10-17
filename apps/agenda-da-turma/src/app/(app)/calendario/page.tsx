import { BackButton } from "@/components/app-shell/back-button";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { isValidDateIso, todayLocalIso } from "@/features/calendar/date";
import { getCalendarSnapshot } from "@/features/calendar/service";
import type { CalendarView as CalendarViewKind } from "@/features/calendar/types";
import { ExportPdfButton } from "@/features/dashboard/components/export-pdf-button";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { getAddEntitlement } from "@/features/notices/trial";
import { listStudentProfilesForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Calendário",
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

  const [profiles, entitlements] = await Promise.all([
    listStudentProfilesForUser(user.id),
    getFamilyEntitlements(user.id),
  ]);

  // Valida ?perfil= contra perfis do user (defensivo: ID inválido cai pra "todos").
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;

  const snapshot = await getCalendarSnapshot(user.id, { view, anchorIso, profileFilter });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-start gap-2">
        <BackButton href="/dashboard" label="Voltar para Hoje" />
        <h1 className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          Calendário
        </h1>
        <ExportPdfButton
          isPro={entitlements.enabled}
          profileFilter={profileFilter}
          anchorIso={anchorIso}
        />
      </header>

      <CalendarView
        userId={user.id}
        addEntitlement={await getAddEntitlement(user.id)}
        view={view}
        anchorIso={anchorIso}
        profileFilter={profileFilter}
        profiles={profiles}
        items={snapshot.items}
      />
    </main>
  );
}
