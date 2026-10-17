import { cn } from "@informach/ui/lib/utils";
import { Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackButton } from "@/components/app-shell/back-button";
import { todayLocalIso } from "@/features/dashboard/date";
import {
  dayMonthLabel,
  daysBetweenIso,
  formatClockTime,
  weekdayLong,
} from "@/features/dashboard/day-labels";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { ACTIVITY_TYPE_LABELS } from "../activity-types";
import { formatEstimate } from "../estimate";
import { getActivityPresentation } from "../presentation";
import type { TaskRow } from "../task-repository";

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/** De onde veio a data, numa frase. Mesmo vocabulário do chip e da revisão. */
const ORIGIN_SENTENCE: Record<TaskRow["dateOrigin"], string> = {
  school: "A escola disse.",
  relative: "Calculada a partir do recado.",
  schedule: "Na próxima aula, pelo horário da turma.",
  family: "Planejado por vocês.",
  unspecified: "O recado não deu data.",
};
/** Sem data e sem recado: a frase não pode pôr a culpa num recado que não existe. */
const UNSPECIFIED_WITHOUT_NOTICE = "Ainda sem data.";

const ORIGIN_DOT: Record<TaskRow["dateOrigin"], string> = {
  school: "bg-foreground",
  relative: "bg-foreground",
  schedule: "bg-primary",
  family: "bg-chart-4",
  unspecified: "border-2 border-dashed border-muted-foreground bg-transparent",
};

function distanceLabel(dueAt: string, todayIso: string) {
  const days = daysBetweenIso(todayIso, dueAt);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (days < 0) return `passou há ${-days} dias`;
  return `daqui a ${days} dias`;
}

const REMINDER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Row({
  label,
  children,
  editHref,
  editLabel,
}: {
  label: string;
  children: ReactNode;
  /** Atalho para o formulário, quando a linha é a coisa que mais se troca. */
  editHref?: string;
  editLabel?: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-t border-foreground/15 px-4 py-2 first:border-t-0 sm:px-5">
      <span className="w-28 shrink-0 text-sm font-semibold text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 break-words text-[15px] font-semibold">{children}</div>
      {editHref && editLabel ? (
        <Link
          href={editHref}
          aria-label={`${editLabel}: ${label.toLowerCase()}`}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-primary-ink"
        >
          {editLabel}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * O detalhe para ler.
 *
 * Tocar numa atividade abria direto o formulário de edição, com treze campos:
 * para saber quando era a prova, a família lia rótulos de campo. Agora o
 * detalhe responde, nesta ordem, o quê, quando (e de onde veio a data), de
 * quem e quem cuida. Editar continua sendo o mesmo formulário único, a um toque
 * (`?editar=1`), e as seções que já existiam (plano de estudo, recado de origem,
 * histórico) vêm como estão.
 */
export function ActivityRead({
  task,
  canEdit,
  sharedByMe,
  completion,
  study,
  original,
  history,
  historyCount,
  historyOpen = false,
}: {
  task: TaskRow;
  canEdit: boolean;
  /** Esta família mandou a atividade para a turma (e não recebeu de outra). */
  sharedByMe: boolean;
  completion: ReactNode;
  study: ReactNode;
  original: ReactNode;
  history: ReactNode;
  historyCount: number;
  /** Aberto quando se chega por "ver o que mudou", no card. */
  historyOpen?: boolean;
}) {
  const todayIso = todayLocalIso();
  const presentation = getActivityPresentation(task.type);
  const TypeIcon = presentation.icon;
  const canceled = task.status === "canceled";
  const turma =
    task.grade && task.classLetter
      ? `${task.grade.replace(/[^0-9]/g, "")}º ano ${task.classLetter}`
      : null;
  const editHref = canEdit && !canceled ? `/atividades/${task.id}?editar=1` : undefined;
  const when = task.dueAt
    ? [task.time ? `às ${formatClockTime(task.time)}` : null, task.location]
        .filter(Boolean)
        .join(" · ")
    : task.location;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-44 pt-4 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <BackButton href="/dashboard" label="Voltar para Hoje" />
        {editHref ? (
          <Link
            href={editHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-foreground/15 bg-background px-4 text-[15px] font-bold hover:bg-muted"
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Link>
        ) : null}
      </div>

      <header className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <StudentAvatar name={task.profileName} size="chip" className="border" />
          {[task.profileName, turma].filter(Boolean).join(" · ")}
        </p>
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted-foreground">
          <TypeIcon className="size-4" aria-hidden />
          {canceled
            ? `${ACTIVITY_TYPE_LABELS[task.type]} · cancelada`
            : ACTIVITY_TYPE_LABELS[task.type]}
        </p>
        <h1
          className={cn(
            "break-words text-[32px] font-extrabold leading-[1.08] tracking-tight",
            canceled && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </h1>
      </header>

      <section
        aria-label="Quando"
        className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-4 sm:p-5"
      >
        {task.dueAt ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                {weekdayLong(task.dueAt)}
              </p>
              <p className="text-3xl font-extrabold leading-tight tracking-tight">
                {dayMonthLabel(task.dueAt, todayIso)}
              </p>
              {when ? <p className="mt-1 text-[15px] font-semibold">{when}</p> : null}
            </div>
            {task.status === "pending" ? (
              <span className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[13px] font-bold">
                {distanceLabel(task.dueAt, todayIso)}
              </span>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-2xl font-extrabold tracking-tight">Sem data marcada</p>
            {when ? <p className="mt-1 text-[15px] font-semibold">{when}</p> : null}
          </div>
        )}
        <div className="flex items-start gap-2.5 border-t border-foreground/15 pt-3 text-sm">
          <span
            aria-hidden
            className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", ORIGIN_DOT[task.dateOrigin])}
          />
          <div className="min-w-0 space-y-1.5">
            <p className="font-bold">
              {task.dateOrigin === "unspecified" && !task.noticeId
                ? UNSPECIFIED_WITHOUT_NOTICE
                : ORIGIN_SENTENCE[task.dateOrigin]}
            </p>
            {task.sourceExcerpt ? (
              <blockquote className="break-words rounded-xl border border-foreground/15 bg-card px-3 py-2 text-[15px] leading-relaxed">
                “{task.sourceExcerpt}”
              </blockquote>
            ) : null}
          </div>
        </div>
      </section>

      <section
        aria-label="Sobre a atividade"
        className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
      >
        <Row label="Matéria">
          {task.subjectName ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  task.subjectColorIndex ? DOT_CLASS[task.subjectColorIndex] : "bg-foreground/70",
                )}
              />
              {task.subjectName}
              {task.profileSubjectId ? (
                <span className="font-medium text-muted-foreground">· fora da escola</span>
              ) : null}
            </span>
          ) : (
            <span className="font-medium text-muted-foreground">Sem matéria</span>
          )}
        </Row>
        <Row label="Quem cuida" editHref={editHref} editLabel="Trocar">
          {task.assignedName ?? (
            <span className="font-medium text-muted-foreground">A combinar</span>
          )}
        </Row>
        <Row label="Lembrete" editHref={editHref} editLabel="Mudar">
          {task.reminderAt ? (
            REMINDER.format(task.reminderAt)
          ) : (
            <span className="font-medium text-muted-foreground">Sem lembrete</span>
          )}
        </Row>
        {task.estimatedMinutes ? (
          <Row label="Leva">Cerca de {formatEstimate(task.estimatedMinutes)}</Row>
        ) : null}
        {task.recurrence === "weekly" ? (
          <Row label="Repete">Toda semana, depois de feita</Row>
        ) : null}
        {task.sharedActivityId ? (
          <Row label="Turma">
            {sharedByMe
              ? `Vocês mandaram para a turma${turma ? ` do ${turma}` : ""}`
              : `Veio da turma${turma ? ` do ${turma}` : ""}`}
          </Row>
        ) : null}
      </section>

      {task.description ? (
        <section
          aria-label="Detalhes"
          className="rounded-[20px] border border-foreground/15 bg-background p-4 sm:p-5"
        >
          <p className="mb-1 text-sm font-semibold text-muted-foreground">Detalhes</p>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {task.description}
          </p>
        </section>
      ) : null}

      {study}
      {original}

      <details
        id="historico"
        open={historyOpen}
        className="group scroll-mt-4 rounded-[20px] border border-foreground/15 bg-background"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-muted-foreground">
            {historyCount === 0
              ? "Sem mudanças desde que foi salva"
              : historyCount === 1
                ? "Mudou 1 vez"
                : `Mudou ${historyCount} vezes`}
          </span>
          <span className="text-primary-ink">Histórico</span>
        </summary>
        <div className="border-t border-foreground/15 px-4 py-4 sm:px-5">{history}</div>
      </details>

      {completion ? (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4">
          <div className="mx-auto max-w-3xl sm:px-4">{completion}</div>
        </div>
      ) : null}
    </main>
  );
}
