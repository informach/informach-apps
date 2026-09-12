import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { getDashboardSnapshot } from "@/features/dashboard/service";
import type { UnifiedActivityListItem } from "@/features/unified-activities/types";
import { listNoticeActions, type NoticeActionRow } from "../repository";
import { RoutineCard } from "./routine-card";

function LegacyRow({ item }: { item: UnifiedActivityListItem }) {
  return (
    <Link
      href={`/calendario?view=day&date=${item.dueAt}&perfil=${item.studentProfileId}`}
      className="block rounded-xl border bg-card p-4 hover:bg-muted/30"
    >
      <p className="text-xs text-muted-foreground">
        {item.studentProfileName} ·{" "}
        {item.source === "extra" ? "Extracurricular" : "Atividade escolar"}
      </p>
      <p className="mt-1 font-semibold">{item.title}</p>
      {"version" in item && (item.version ?? 1) > 1 ? (
        <span className="mt-2 inline-block text-xs font-medium text-amber-700 dark:text-amber-400">
          Atualizada · versão {item.version} — confira a alteração
        </span>
      ) : null}
      <p className="mt-2 text-sm text-muted-foreground">
        {item.dueAt.split("-").reverse().join("/")} · Abrir para acompanhar
      </p>
    </Link>
  );
}

export async function TomorrowRoutine({
  userId,
  profileFilter,
}: {
  userId: string;
  profileFilter: string | null;
}) {
  const today = todayLocalIso();
  const tomorrow = addDaysIso(today, 1);
  const weekEnd = addDaysIso(today, 7);
  const [notices, legacy] = await Promise.all([
    listNoticeActions(userId, { profileId: profileFilter ?? undefined }),
    getDashboardSnapshot(userId, { profileFilter, limit: 100 }),
  ]);
  const attention = notices.filter(({ action: a }) => !a.dueAt || a.dueAt <= today);
  const tomorrowItems = notices.filter(({ action: a }) => a.dueAt === tomorrow);
  const week = notices.filter(
    ({ action: a }) => a.dueAt && a.dueAt > tomorrow && a.dueAt <= weekEnd,
  );
  const legacyTomorrow = legacy.upcoming.filter((i) => i.dueAt === tomorrow);
  const legacyWeek = legacy.upcoming.filter((i) => i.dueAt > tomorrow);
  function section(
    title: string,
    description: string,
    rows: NoticeActionRow[],
    older: UnifiedActivityListItem[],
    empty: string,
  ) {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {rows.length || older.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <RoutineCard key={row.action.id} item={row} />
            ))}
            {older.map((item) => (
              <LegacyRow
                key={`${item.source}:${item.activityId}:${item.studentProfileId}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {empty}
          </p>
        )}
      </section>
    );
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={profileFilter ? `/recados/novo?perfil=${profileFilter}` : "/recados/novo"}>
            Importar mensagem ou foto
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={profileFilter ? `/atividades?perfil=${profileFilter}` : "/atividades"}>
            Ver atividades
          </Link>
        </Button>
      </div>
      {section(
        "Precisa de atenção",
        "Pendências de hoje, prazos que passaram e datas a confirmar.",
        attention,
        [...legacy.overdue, ...legacy.today],
        "Nenhuma pendência de hoje ou data a confirmar entre os itens cadastrados.",
      )}
      {section(
        "Preparar para amanhã",
        "Confira materiais, tarefas e compromissos antes de começar o próximo dia.",
        tomorrowItems,
        legacyTomorrow,
        "Nada cadastrado para amanhã. Importe os recados novos para manter a rotina atualizada.",
      )}
      {section(
        "Próximos sete dias",
        "Antecipe entregas, provas e eventos.",
        week,
        legacyWeek,
        "Nenhum compromisso cadastrado para os próximos dias.",
      )}
      <p className="text-xs text-muted-foreground">
        “Feito em casa” registra a organização da família. Entregas e autorizações à escola
        continuam no canal oficial. As listas consideram os itens cadastrados; novos recados e
        retificações precisam ser importados.
      </p>
    </div>
  );
}
