"use client";

import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { CalendarClock, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ESTIMATE_PRESETS, formatEstimate } from "@/features/unified-activities/estimate";
import { catchActionResult } from "@/lib/action-result";
import { createStudyPlanAction, removeStudyPlanAction } from "../actions";
import { MAX_STUDY_SESSIONS } from "../plan";

export type StudySession = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
};

const SESSION_OPTIONS = Array.from({ length: MAX_STUDY_SESSIONS }, (_, i) => i + 1);
const formatDay = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "sem data");

/**
 * "Planejar estudo": reparte a preparação nos dias antes da prova.
 *
 * Existe porque a prova marcada para a semana que vem não diz nada sobre
 * quando estudar, e é isso que decide se ela foi preparada ou improvisada na
 * véspera. É opt-in e aritmético — a leitura de recado continua proibida de
 * inventar sessão de estudo.
 */
export function StudyPlanSection({
  taskId,
  sessions,
}: {
  taskId: string;
  sessions: StudySession[];
}) {
  const router = useRouter();
  const [count, setCount] = useState(3);
  const [minutes, setMinutes] = useState<number>(30);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) => startTransition(async () => void (await fn()));

  return (
    <section aria-labelledby="study-plan-title" className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-3/15 text-chart-3-ink">
          <CalendarClock className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="study-plan-title" className="font-semibold">
            Plano de estudo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sessions.length
              ? "As sessões entram na rotina como qualquer atividade, e são planejamento da família."
              : "Reparte a preparação nos dias mais livres antes da prova. Você escolhe quantas sessões e de quanto tempo."}
          </p>
        </div>
      </div>

      {sessions.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm"
              >
                <span
                  aria-hidden
                  className={
                    session.status === "done"
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-2/20 text-chart-2-ink"
                      : "flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed"
                  }
                >
                  {session.status === "done" ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 break-words">{session.title}</span>
                <span className="shrink-0 text-muted-foreground">{formatDay(session.dueAt)}</span>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await catchActionResult(() => removeStudyPlanAction({ taskId }));
                if (!result.ok) {
                  toast.error("Não foi possível remover o plano.");
                  return;
                }
                toast.success("Plano removido. O que já foi feito continua no histórico.");
                router.refresh();
              })
            }
          >
            Remover plano
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <label htmlFor="study-sessions" className="grid gap-2 text-sm font-medium">
            Sessões
            <select
              id="study-sessions"
              className="h-11 rounded-md border bg-background px-3"
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
          <label htmlFor="study-minutes" className="grid gap-2 text-sm font-medium">
            Cada uma
            <select
              id="study-minutes"
              className="h-11 rounded-md border bg-background px-3"
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
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await catchActionResult(() =>
                  createStudyPlanAction({ taskId, sessions: count, minutesEach: minutes }),
                );
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
              })
            }
          >
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Planejar estudo
          </Button>
        </div>
      )}
    </section>
  );
}
