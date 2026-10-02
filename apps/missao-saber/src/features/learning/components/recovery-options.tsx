import { StartButton } from "@/components/controls";
import {
  assertableAvailabilityMessage,
  type ContentState,
  lessonAvailability,
} from "@/features/content/availability";
import { recoveryLessons } from "@/features/content/catalog";
import type { Course } from "@/features/content/types";
import { type Evidence, reviewDateLabel } from "../engine";
import { recoveryRelease } from "../recovery";
import { EvidenceProgress } from "./evidence-progress";

export function RecoveryOptions({
  skillId,
  evidence,
  attempted,
  profile,
  course,
  paid,
  profileAllowed,
  states,
}: {
  skillId: string;
  evidence: Evidence[];
  attempted: ReadonlySet<string>;
  profile: { id: string; grade: number };
  course: Course;
  paid: boolean;
  profileAllowed: boolean;
  states: ReadonlyMap<string, ContentState>;
}) {
  if (!evidence.some((row) => row.skillId === skillId)) return null;
  return (
    <details className="mx-auto mt-5 max-w-2xl rounded-card border-2 border-sombra bg-creme p-4">
      <summary className="cursor-pointer font-display font-semibold text-tinta">
        Novas situações para esta habilidade
      </summary>
      <p className="mt-2 text-sm text-tinta-suave">
        Dois encontros de três questões. O segundo abre no dia seguinte ao término do primeiro, pelo
        calendário de São Paulo. Você pode continuar praticando as outras missões enquanto isso.
      </p>
      <EvidenceProgress evidence={evidence} skillId={skillId} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {recoveryLessons
          .filter((l) => l.skillId === skillId)
          .map((lesson) => {
            const release = recoveryRelease(lesson, evidence, new Date());
            const access = lessonAvailability({
              lesson,
              course,
              grade: profile.grade,
              paid,
              profileAllowed,
              state: states.get(lesson.id),
            });
            const done = lesson.items.every((item) => attempted.has(item.id));
            return (
              <div key={lesson.id}>
                <h3 className="font-semibold text-tinta">{lesson.title}</h3>
                <p className="my-2 text-sm text-tinta-suave">
                  {!access.available
                    ? assertableAvailabilityMessage(access.reason)
                    : !release.ready
                      ? release.on
                        ? `Abre em ${reviewDateLabel(release.on)}.`
                        : "Responda às três questões do primeiro encontro."
                      : done
                        ? "Questões já respondidas. Repetir é prática, sem nova primeira tentativa."
                        : "Três situações para aplicar suas estratégias."}
                </p>
                <StartButton
                  profileId={profile.id}
                  lessonId={lesson.id}
                  mode="review"
                  disabled={!access.available || !release.ready}
                  tom="contorno"
                  medida="p"
                >
                  {done ? "Repetir para praticar" : "Abrir novo encontro"}
                </StartButton>
              </div>
            );
          })}
      </div>
    </details>
  );
}
