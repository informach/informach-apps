import { Button } from "@informach/ui/components/button";
import { Check, Compass } from "lucide-react";
import Link from "next/link";
import { countUserProfilesWithoutTurma } from "@/features/students/service";
import { computeFirstSteps, firstStepsProgress } from "../first-steps";
import {
  hasAnyActivity,
  isFirstStepsDismissed,
  listTurmasNeedingScheduleForUser,
} from "../first-steps-repository";
import { DismissFirstStepsButton } from "./dismiss-first-steps-button";

/**
 * A trilha do começo, no lugar de três cards soltos.
 *
 * Antes havia um widget por pendência — criança, turma, matérias — cada um
 * aparecendo e sumindo sozinho, sem dizer quantos passos faltavam nem por que
 * aquele importava. Junto, vira um caminho com fim à vista.
 *
 * Some sozinha quando os quatro passos estão feitos, e antes disso pode ser
 * dispensada: quem já sabe o que quer não precisa de trilha. A dispensa é a
 * primeira consulta e corta as outras — na maioria das sessões esta seção não
 * aparece, e não deve custar cinco consultas para decidir isso.
 */
export async function FirstStepsSection({
  userId,
  profileCount,
}: {
  userId: string;
  /** Já contado pelo dashboard: não vale uma segunda consulta. */
  profileCount: number;
}) {
  if (await isFirstStepsDismissed(userId)) return null;
  const [profilesWithoutTurma, turmasNeedingSchedule, hasActivity] = await Promise.all([
    countUserProfilesWithoutTurma(userId),
    listTurmasNeedingScheduleForUser(userId),
    hasAnyActivity(userId),
  ]);
  const steps = computeFirstSteps({
    profileCount,
    profilesWithoutTurma,
    turmasNeedingSchedule,
    activityCount: hasActivity ? 1 : 0,
  });
  const progress = firstStepsProgress(steps);
  if (progress.complete) return null;
  const next = steps.find((step) => !step.done);

  return (
    <section
      aria-labelledby="first-steps-title"
      className="rounded-3xl border border-secondary/30 bg-gradient-to-br from-secondary/10 via-secondary/5 to-chart-3/10 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary/15 text-chart-3-ink">
          <Compass className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="first-steps-title" className="text-lg font-semibold">
            Primeiros passos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.done} de {progress.total} prontos. Cada passo deixa a rotina mais automática.
          </p>
        </div>
        <DismissFirstStepsButton />
      </div>
      <ol className="mt-5 flex flex-col gap-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3"
          >
            <span
              aria-hidden
              className={
                step.done
                  ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-2/20 text-chart-2-ink"
                  : "flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed"
              }
            >
              {step.done ? <Check className="size-4" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className={step.done ? "text-sm text-muted-foreground" : "text-sm font-semibold"}>
                {step.title}
                {step.done ? <span className="sr-only"> (concluído)</span> : null}
              </p>
              {!step.done && step.id === next?.id ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
              ) : null}
            </div>
            {!step.done ? (
              <Button
                asChild
                size="sm"
                variant={step.id === next?.id ? "default" : "outline"}
                className="min-h-11 shrink-0"
              >
                <Link href={step.href}>{step.cta}</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
