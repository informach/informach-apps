"use client";

import { toast } from "@informach/ui/components/sonner";
import { cn } from "@informach/ui/lib/utils";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shortDayLabel, weekdayLong, weekdayShort } from "@/features/dashboard/day-labels";
import { countWord } from "@/features/dashboard/routine-summary";
import {
  ESTIMATE_PRESETS,
  formatEstimate,
  formatEstimateLong,
} from "@/features/unified-activities/estimate";
import { catchActionResult } from "@/lib/action-result";
import { createStudyPlanAction, removeStudyPlanAction } from "../actions";
import { MAX_STUDY_SESSIONS } from "../plan";
import type { StudyPlanProposal } from "../service";

export type StudySession = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
};

const SESSION_OPTIONS = Array.from({ length: MAX_STUDY_SESSIONS }, (_, i) => i + 1);

const CHIP =
  "inline-flex h-[30px] items-center gap-1.5 rounded-full bg-card px-3 text-[13px] font-bold";

/** "hoje, seg 19" e "ter, 20", como nas pílulas da prancha. */
function dayChip(iso: string, todayIso: string) {
  return iso === todayIso
    ? `hoje, ${weekdayShort(iso)} ${Number(iso.slice(8))}`
    : shortDayLabel(iso, todayIso);
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Três sessões de 30 minutos nos dias mais livres até a véspera." e, quando o
 * plano pulou um dia por já ter entrega, o porquê, para a família entender a
 * escolha antes de aceitar.
 */
function proposalSentence(proposal: StudyPlanProposal) {
  const count = proposal.days.length;
  const head = `${capitalize(countWord(count))} ${count === 1 ? "sessão" : "sessões"} de ${formatEstimateLong(proposal.minutesEach)} nos dias mais livres até a véspera.`;
  const avoided = proposal.avoided;
  if (!avoided) return head;
  const onlyExams = avoided.exams === avoided.deliveries;
  const what =
    avoided.deliveries === 1
      ? onlyExams
        ? "outra prova"
        : "outra entrega"
      : `${countWord(avoided.deliveries)} ${onlyExams ? "provas" : "entregas"}`;
  return `${head} ${weekdayLong(avoided.iso)} já tem ${what}, então a Agenda evita amontoar.`;
}

/**
 * "Dividir o estudo": reparte a preparação nos dias antes da prova.
 *
 * Existe porque a prova marcada para a semana que vem não diz nada sobre
 * quando estudar, e é isso que decide se ela foi preparada ou improvisada na
 * véspera. Como no canvas, a tela já chega com a proposta pronta (os dias em
 * pílulas) e um toque a coloca na rotina; "Outro jeito" abre a escolha de
 * quantas sessões e de quanto tempo. É opt-in e aritmético: a leitura de
 * recado continua proibida de inventar sessão de estudo.
 */
export function StudyPlanSection({
  taskId,
  sessions,
  proposal,
  todayIso,
}: {
  taskId: string;
  sessions: StudySession[];
  /** `null` quando não sobra dia entre hoje e a véspera. */
  proposal: StudyPlanProposal | null;
  todayIso: string;
}) {
  const router = useRouter();
  const [other, setOther] = useState(false);
  const [count, setCount] = useState(proposal?.days.length || 3);
  const [minutes, setMinutes] = useState<number>(proposal?.minutesEach ?? 30);
  const [pending, startTransition] = useTransition();

  const create = (input: { sessions: number; minutesEach: number }) =>
    startTransition(async () => {
      const result = await catchActionResult(() => createStudyPlanAction({ taskId, ...input }));
      if (!result.ok) {
        toast.error(
          result.error.code === "NO_TIME_LEFT"
            ? "Não sobra dia entre hoje e a véspera para dividir o estudo."
            : result.error.code === "ACTIVITY_LIMIT_REACHED"
              ? "O plano gratuito permite 20 pendências. Conclua algumas para liberar espaço."
              : "Não foi possível planejar agora.",
        );
        return;
      }
      toast.success(
        result.value.sessions === 1
          ? "1 sessão de estudo na rotina"
          : `${result.value.sessions} sessões de estudo na rotina`,
      );
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await catchActionResult(() => removeStudyPlanAction({ taskId }));
      if (!result.ok) {
        toast.error("Não foi possível remover o plano.");
        return;
      }
      toast.success("Plano removido. O que já foi feito continua no histórico.");
      router.refresh();
    });

  const primary =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] border-foreground px-4 text-[15px] font-bold hover:bg-muted disabled:opacity-60";
  const quiet =
    "inline-flex min-h-11 items-center px-2.5 text-[15px] font-bold text-primary-ink hover:underline disabled:opacity-60";

  return (
    <section
      aria-labelledby="study-plan-title"
      className="flex flex-col gap-3 rounded-[20px] border border-foreground/15 bg-background p-[18px]"
    >
      <h2 id="study-plan-title" className="text-[19px] font-bold tracking-[-0.01em]">
        Dividir o estudo
      </h2>

      {sessions.length ? (
        <>
          <p className="text-[15px] leading-normal text-foreground/85">
            As sessões entram na rotina como qualquer atividade, e são planejamento da família.
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Sessões de estudo">
            {sessions.map((session) => (
              <li
                key={session.id}
                className={cn(CHIP, session.status === "done" && "text-muted-foreground")}
              >
                {session.status === "done" ? (
                  <Check className="size-3.5 text-chart-2-ink" aria-label="feita" />
                ) : null}
                {session.dueAt ? dayChip(session.dueAt, todayIso) : "sem data"}
              </li>
            ))}
          </ul>
          <div className="mt-0.5">
            <button
              type="button"
              className={cn(quiet, "text-destructive-ink")}
              disabled={pending}
              onClick={remove}
            >
              Remover plano
            </button>
          </div>
        </>
      ) : !proposal ? (
        <p className="text-[15px] leading-normal text-foreground/85">
          Não sobra dia entre hoje e a véspera para dividir o estudo.
        </p>
      ) : (
        <>
          <p className="text-[15px] leading-normal text-foreground/85">
            {proposalSentence(proposal)}
          </p>
          {other ? (
            <div className="flex flex-wrap items-end gap-4">
              <label htmlFor="study-sessions" className="grid gap-2 text-sm font-semibold">
                Sessões
                <select
                  id="study-sessions"
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {SESSION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="study-minutes" className="grid gap-2 text-sm font-semibold">
                Cada uma
                <select
                  id="study-minutes"
                  className="h-11 rounded-xl border border-foreground/15 bg-background px-3"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  {ESTIMATE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {formatEstimate(preset)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Os dias propostos">
              {proposal.days.map((iso) => (
                <li key={iso} className={CHIP}>
                  {dayChip(iso, todayIso)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-0.5 flex flex-wrap gap-2.5">
            <button
              type="button"
              className={primary}
              disabled={pending}
              onClick={() =>
                create(
                  other
                    ? { sessions: count, minutesEach: minutes }
                    : { sessions: proposal.days.length, minutesEach: proposal.minutesEach },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Colocar na rotina
            </button>
            {other ? null : (
              <button type="button" className={quiet} onClick={() => setOther(true)}>
                Outro jeito
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
