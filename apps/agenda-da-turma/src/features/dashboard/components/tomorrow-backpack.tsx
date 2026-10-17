import { Backpack } from "lucide-react";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import type { TodaySubjectsView } from "../today-subjects-service";

/**
 * A mochila de amanhã, no topo de Hoje depois das 18h.
 *
 * À noite a pergunta da casa deixa de ser "o que tem hoje" e passa a ser "o
 * que vai na mochila". Uma linha por criança, com as aulas de amanhã e o que
 * cada uma pede sempre ("levar sempre"). Os materiais pedidos em atividades
 * aparecem em "Amanhã", logo abaixo, onde se marcam como feitos.
 */
export function TomorrowBackpack({
  schedule,
  kits = {},
}: {
  schedule: TodaySubjectsView[];
  kits?: Record<string, string[]>;
}) {
  const withClasses = schedule.filter((view) => view.subjects.length > 0);
  if (withClasses.length === 0) return null;

  return (
    <section
      aria-labelledby="tomorrow-backpack-title"
      className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
    >
      <div className="flex items-center gap-3 px-4 pb-2 pt-4 sm:px-5">
        <Backpack className="size-6 shrink-0" aria-hidden />
        <h2 id="tomorrow-backpack-title" className="text-xl font-extrabold tracking-tight">
          A mochila de amanhã
        </h2>
      </div>
      <ul>
        {withClasses.map((view) => {
          const items = view.subjects.flatMap(
            (subject) => kits[`${view.profileId}:${subject.id}`] ?? [],
          );
          return (
            <li
              key={view.profileId}
              className="flex items-start gap-3 border-t border-foreground/15 px-4 py-3 sm:px-5"
            >
              <StudentAvatar name={view.profileName} size="row" />
              <div className="min-w-0 text-[15px] leading-snug">
                <p className="font-bold">{view.profileName}</p>
                <p className="text-muted-foreground">
                  {view.subjects.map((subject) => subject.name).join(", ")}
                </p>
                {items.length ? (
                  <p className="mt-0.5 font-semibold">Leva {items.join(", ")}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
