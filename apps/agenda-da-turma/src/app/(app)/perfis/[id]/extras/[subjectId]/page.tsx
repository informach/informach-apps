import { Badge } from "@informach/ui/components/badge";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/app-shell/back-button";
import { NewProfileSubjectActivityButton } from "@/features/profile-subject-activities/components/new-profile-subject-activity-button";
import { ProfileSubjectActivityCard } from "@/features/profile-subject-activities/components/profile-subject-activity-card";
import { getProfileSubjectWithActivitiesForUser } from "@/features/profile-subject-activities/service";
import { formatExtraClassDaysShort } from "@/features/profile-subjects/class-days";
import {
  getSubjectIcon,
  getSubjectIconClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { requireUserServer } from "@/lib/auth";

type Props = {
  params: Promise<{ id: string; subjectId: string }>;
};

export const metadata = {
  title: "Atividades da matéria",
};

function formatPausedSinceLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export default async function ProfileSubjectDetailPage({ params }: Props) {
  const { id: profileId, subjectId } = await params;
  const user = await requireUserServer();
  const result = await getProfileSubjectWithActivitiesForUser(user.id, subjectId);
  if (!result.ok) notFound();

  const { subject, activities } = result.value;
  const Icon = getSubjectIcon(subject.name);
  const isPaused = subject.status === "paused";
  const classDaysLabel = formatExtraClassDaysShort(subject.classDays);

  const pendingActivities = activities.filter((a) => a.status === "pending");
  const doneActivities = activities.filter((a) => a.status === "done");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex items-start gap-2">
        <BackButton href={`/perfis/${profileId}/extras`} label="Voltar para matérias" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${getSubjectIconClassByIndex(subject.colorIndex)}`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{subject.name}</h1>
              <Badge variant="outline">
                <Sparkles className="mr-1 size-3" aria-hidden />
                Fora da escola
              </Badge>
              {isPaused ? (
                <Badge
                  variant="outline"
                  className={getSubjectTintedClassByIndex(subject.colorIndex)}
                >
                  Pausada
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {classDaysLabel || "Sem dias cadastrados"}
            {isPaused && subject.pausedAt
              ? ` · pausada desde ${formatPausedSinceLabel(subject.pausedAt)}`
              : null}
          </p>
        </div>
        <NewProfileSubjectActivityButton
          profileSubjectId={subject.id}
          profileSubjectName={subject.name}
          disabled={isPaused}
          disabledTitle={isPaused ? "Retome a matéria para criar atividades" : undefined}
        />
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Pendentes{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({pendingActivities.length})
          </span>
        </h2>
        {pendingActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade pendente. Adicione um lembrete ou tarefa para esta matéria.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingActivities.map((a) => (
              <ProfileSubjectActivityCard
                key={a.id}
                activity={a}
                profileSubjectName={subject.name}
              />
            ))}
          </div>
        )}
      </section>

      {doneActivities.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            Concluídas{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({doneActivities.length})
            </span>
          </h2>
          <div className="space-y-3">
            {doneActivities.map((a) => (
              <ProfileSubjectActivityCard
                key={a.id}
                activity={a}
                profileSubjectName={subject.name}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
