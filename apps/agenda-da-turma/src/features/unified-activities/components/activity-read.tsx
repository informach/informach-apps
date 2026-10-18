import { cn } from "@informach/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { appHour, todayLocalIso } from "@/features/dashboard/date";
import {
  dayMonthLabel,
  daysBetweenIso,
  formatClockTime,
  weekdayLong,
} from "@/features/dashboard/day-labels";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { ACTIVITY_TYPE_LABELS } from "../activity-types";
import { formatEstimateLong } from "../estimate";
import { getActivityPresentation } from "../presentation";
import type { TaskRow } from "../task-repository";
import { SHEET_LINK } from "./activity-list";

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
  unspecified: "border-[1.5px] border-dashed border-muted-foreground bg-transparent",
};

function distanceLabel(dueAt: string, todayIso: string) {
  const days = daysBetweenIso(todayIso, dueAt);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (days < 0) return `passou há ${-days} dias`;
  return `daqui a ${days} dias`;
}

const REMINDER_MINUTE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  minute: "2-digit",
});

/** "Quarta, 21, às 19h", e "às 19h30" quando o minuto conta. */
function reminderLabel(at: Date) {
  const iso = todayLocalIso(at);
  const minute = Number(REMINDER_MINUTE.format(at));
  const clock = `${appHour(at)}h${minute ? String(minute).padStart(2, "0") : ""}`;
  return `${weekdayLong(iso)}, ${Number(iso.slice(8))}, às ${clock}`;
}

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
    <div className="flex min-h-14 items-center gap-3 border-t border-foreground/15 px-4 py-2 text-[15px] first:border-t-0">
      <span className="w-[104px] shrink-0 font-semibold text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 break-words font-bold">{children}</div>
      {editHref && editLabel ? (
        <Link
          href={editHref}
          aria-label={`${editLabel}: ${label.toLowerCase()}`}
          className={cn(SHEET_LINK, "shrink-0")}
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
 * (`?editar=1`).
 *
 * O desenho é o da prancha: "← Hoje" e "Editar" no topo, com o "⋮" de mais
 * ações (cancelar); a criança e a turma, o tipo na cor dele, o título; a folha
 * do quando; as linhas de matéria, quem cuida, lembrete e duração; "Dividir o
 * estudo"; "De onde veio"; o histórico numa linha; e "Feito" fixo no pé.
 */
export function ActivityRead({
  task,
  canEdit,
  sharedByMe,
  more,
  whereSentence,
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
  /** O "⋮" ao lado de Editar (cancelar a atividade). */
  more?: ReactNode;
  /** "Está no recado do Teams enviado em 15/10.", quando a atividade veio de recado. */
  whereSentence?: string | null;
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
  const typeLabel = canceled
    ? `${ACTIVITY_TYPE_LABELS[task.type]} · cancelada`
    : ACTIVITY_TYPE_LABELS[task.type];

  return (
    <main className="mx-auto max-w-3xl px-4 pb-44 lg:pt-6">
      <div className="-ml-3 -mr-2 flex h-14 items-center justify-between gap-3">
        <Link
          href="/dashboard"
          aria-label="Voltar para Hoje"
          className="flex min-h-11 items-center gap-1.5 px-2.5 text-[15px] font-bold"
        >
          <ArrowLeft className="size-[22px]" aria-hidden />
          Hoje
        </Link>
        <div className="flex gap-1">
          {editHref ? (
            <Link
              href={editHref}
              className="inline-flex min-h-11 items-center rounded-xl border border-foreground/15 bg-background px-3.5 text-[15px] font-bold hover:bg-muted"
            >
              Editar
            </Link>
          ) : null}
          {more}
        </div>
      </div>

      <header className="flex flex-col gap-3 px-1 pt-1.5">
        <p className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
          <StudentAvatar name={task.profileName} size="detail" />
          {[task.profileName, turma].filter(Boolean).join(" · ")}
        </p>
        <p className={cn("flex items-center gap-2 text-sm font-extrabold", presentation.ink)}>
          <TypeIcon className="size-[18px]" aria-hidden />
          {typeLabel.toUpperCase()}
        </p>
        <h1
          className={cn(
            "break-words text-[32px] font-extrabold leading-[1.08] tracking-[-0.035em]",
            canceled && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </h1>
      </header>

      <div className="mt-[18px] space-y-3">
        <section
          aria-label="Quando"
          className="flex flex-col gap-3 rounded-[20px] border border-foreground/15 bg-background p-[18px]"
        >
          {task.dueAt ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                  {weekdayLong(task.dueAt)}
                </p>
                <p className="text-[30px] font-extrabold leading-none tracking-[-0.03em]">
                  {dayMonthLabel(task.dueAt, todayIso)}
                </p>
                {when ? <p className="mt-1.5 text-[15px] font-semibold">{when}</p> : null}
              </div>
              {task.status === "pending" ? (
                <span className="inline-flex h-[30px] items-center rounded-full border border-foreground/15 px-3 text-[13px] font-bold">
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
          <p className="flex items-center gap-2.5 border-t border-foreground/15 pt-3 text-sm">
            <span
              aria-hidden
              className={cn("size-[9px] shrink-0 rounded-full", ORIGIN_DOT[task.dateOrigin])}
            />
            <span>
              <b>
                {task.dateOrigin === "unspecified" && !task.noticeId
                  ? UNSPECIFIED_WITHOUT_NOTICE
                  : ORIGIN_SENTENCE[task.dateOrigin]}
              </b>
              {whereSentence ? ` ${whereSentence}` : null}
            </span>
          </p>
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
                    "size-[9px] shrink-0 rounded-full",
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
              reminderLabel(task.reminderAt)
            ) : (
              <span className="font-medium text-muted-foreground">Sem lembrete</span>
            )}
          </Row>
          {task.estimatedMinutes ? (
            <Row label="Leva">Cerca de {formatEstimateLong(task.estimatedMinutes)}</Row>
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
            className="rounded-[20px] border border-foreground/15 bg-background p-[18px]"
          >
            <p className="mb-1 text-sm font-semibold text-muted-foreground">Detalhes</p>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {task.description}
            </p>
          </section>
        ) : null}

        {study}
        {original}

        {/* O histórico é uma linha, como na prancha; abre embaixo dela. */}
        <details id="historico" open={historyOpen} className="group scroll-mt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-1 text-sm [&::-webkit-details-marker]:hidden">
            <span className="text-muted-foreground">
              {historyCount === 0
                ? "Sem mudanças desde que foi salva"
                : historyCount === 1
                  ? "Mudou 1 vez"
                  : `Mudou ${historyCount} vezes`}
            </span>
            <span className="font-bold text-primary-ink underline">Histórico</span>
          </summary>
          <div className="mt-2 rounded-[20px] border border-foreground/15 bg-background p-[18px]">
            {history}
          </div>
        </details>
      </div>

      {completion ? (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 px-4 lg:bottom-6">
          <div className="mx-auto max-w-3xl">{completion}</div>
        </div>
      ) : null}
    </main>
  );
}
