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
 * Antes havia um widget por pendência (criança, turma, matérias), cada um
 * aparecendo e sumindo sozinho, sem dizer quantos passos faltavam nem por que
 * aquele importava. Junto, vira um caminho com fim à vista.
 *
 * Some sozinha quando os quatro passos estão feitos, e antes disso pode ser
 * dispensada: quem já sabe o que quer não precisa de trilha. A dispensa é a
 * primeira consulta e corta as outras: na maioria das sessões esta seção não
 * aparece, e não deve custar cinco consultas para decidir isso.
 */
export async function FirstStepsSection({
  userId,
  profileCount,
  ownsAnyProfile,
}: {
  userId: string;
  /** Já contado pelo dashboard: não vale uma segunda consulta. */
  profileCount: number;
  /**
   * Alguma das crianças visíveis é desta conta?
   *
   * O segundo adulto **não** pode fazer os dois primeiros passos: cadastrar
   * criança e vincular turma são do titular, e turma é escopada por conta. Ele
   * via "1 de 4 prontos" com um botão que levava a uma tela onde não havia o
   * que criar: uma trilha que nunca fechava. Também sai do caminho para quem é
   * titular de uma casa e convidado de outra, pelo mesmo motivo.
   */
  ownsAnyProfile: boolean;
}) {
  if (profileCount > 0 && !ownsAnyProfile) return null;
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
      className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5">
        <Compass className="mt-1 size-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="first-steps-title" className="text-xl font-extrabold tracking-tight">
            Primeiros passos
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {progress.done} de {progress.total} prontos. Cada passo deixa a Agenda mais esperta.
          </p>
        </div>
        <DismissFirstStepsButton />
      </div>
      <ol>
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex flex-wrap items-center gap-3 border-t border-foreground/15 px-4 py-3 sm:px-5"
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
              <p
                className={
                  step.done ? "text-sm text-muted-foreground" : "text-[15px] font-bold leading-snug"
                }
              >
                {step.title}
                {step.done ? <span className="sr-only"> (concluído)</span> : null}
              </p>
              {!step.done && step.id === next?.id ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              ) : null}
            </div>
            {!step.done ? (
              <Button
                asChild
                variant={step.id === next?.id ? "default" : "outline"}
                className="min-h-11 shrink-0 rounded-xl font-bold"
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
