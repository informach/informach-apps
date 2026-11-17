import Link from "next/link";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { isValidDateIso, shiftAnchor, todayLocalIso } from "@/features/calendar/date";
import { getCalendarSnapshot } from "@/features/calendar/service";
import type { CalendarView as CalendarViewKind } from "@/features/calendar/types";
import { ExportPdfButton } from "@/features/dashboard/components/export-pdf-button";
import { agendaAuthority } from "@/features/family/context";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { FilteredByChild } from "@/features/students/components/child-filter";
import { listStudentProfilesForUser } from "@/features/students/service";
import { shortChildNames, withShortChildName } from "@/features/students/utils";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Semana",
};

type Props = {
  searchParams: Promise<{
    view?: string;
    date?: string;
    perfil?: string;
  }>;
};

/**
 * Semana é a vista de abrir, e o mês fica a um toque. A antiga vista do dia
 * saiu: a semana já mostra cada dia inteiro, e `?view=day` (links guardados,
 * e-mails antigos) cai na semana daquele dia.
 */
function parseView(value: string | undefined): CalendarViewKind {
  return value === "month" ? "month" : "week";
}

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const user = await requireUserServer();
  const actor = await agendaAuthority(user.id);
  const todayIso = todayLocalIso();

  const view = parseView(params.view);
  const anchorIso = params.date && isValidDateIso(params.date) ? params.date : todayIso;

  const [profiles, entitlements] = await Promise.all([
    listStudentProfilesForUser(actor),
    getFamilyEntitlements(actor),
  ]);

  // Valida ?perfil= contra as crianças acessíveis: id inválido cai em "Todas".
  const profileFilter =
    params.perfil && profiles.some((p) => p.id === params.perfil) ? params.perfil : null;

  // Os cards e as linhas da semana levam o nome curto de cada criança.
  const childNames = shortChildNames(profiles);
  const snapshot = await getCalendarSnapshot(actor, { view, anchorIso, profileFilter });

  // Todo endereço da tela leva a vista, a data e a criança que estão nela.
  const hrefWith = (next: {
    view?: CalendarViewKind;
    date?: string;
    perfil?: string | null;
  }): `/calendario${"" | `?${string}`}` => {
    const query = new URLSearchParams();
    if ((next.view ?? view) === "month") query.set("view", "month");
    const date = next.date ?? anchorIso;
    if (date !== todayIso) query.set("date", date);
    const perfil = next.perfil === undefined ? profileFilter : next.perfil;
    if (perfil) query.set("perfil", perfil);
    const text = query.toString();
    return text ? (`/calendario?${text}` as const) : "/calendario";
  };
  const hrefs = {
    // Do mês para a semana: no mês de hoje, a semana de hoje; em outro mês, a
    // semana do dia em que o mês está (o dia 1, quando veio pelas setas).
    week: hrefWith({
      view: "week",
      date: anchorIso.slice(0, 7) === todayIso.slice(0, 7) ? todayIso : anchorIso,
    }),
    month: hrefWith({ view: "month" }),
    prev: hrefWith({ date: shiftAnchor(anchorIso, view, -1) }),
    next: hrefWith({ date: shiftAnchor(anchorIso, view, 1) }),
    today: hrefWith({ date: todayIso }),
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-3.5 px-4 pb-28 pt-3.5 md:px-8 md:pt-8">
      <FilteredByChild
        profiles={profiles}
        current={profileFilter}
        clearHref={hrefWith({ perfil: null })}
      />
      <CalendarView
        view={view}
        anchorIso={anchorIso}
        todayIso={todayIso}
        profileFilter={profileFilter}
        items={snapshot.items.map((item) => withShortChildName(item, childNames))}
        undated={snapshot.undated.map((item) => withShortChildName(item, childNames))}
        hrefs={hrefs}
      />
      {view === "week" ? (
        <div className="flex items-center justify-between gap-3">
          <Link
            href={profileFilter ? `/atividades?perfil=${profileFilter}` : "/atividades"}
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink underline"
          >
            Lista de todas as atividades
          </Link>
          <ExportPdfButton
            isPro={entitlements.enabled}
            profileFilter={profileFilter}
            anchorIso={anchorIso}
            className="h-auto min-h-11 max-w-[176px] shrink-0 whitespace-normal rounded-xl bg-background px-3 py-1.5 text-left text-sm font-bold leading-tight [&_svg]:size-5"
          />
        </div>
      ) : null}
    </main>
  );
}
