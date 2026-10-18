import { notFound } from "next/navigation";
import { BackButton } from "@/components/app-shell/back-button";
import { getIsProForUser } from "@/features/billing/server-cache";
import { NewProfileSubjectButton } from "@/features/profile-subjects/components/new-profile-subject-button";
import { ProfileSubjectsList } from "@/features/profile-subjects/components/profile-subjects-list";
import {
  FREE_PROFILE_SUBJECT_LIMIT,
  PRO_PROFILE_SUBJECT_LIMIT,
} from "@/features/profile-subjects/limits";
import { getProfileSubjectsForUserAndProfile } from "@/features/profile-subjects/service";
import { requireUserServer } from "@/lib/auth";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: "Atividades extras",
};

export default async function ProfileExtrasPage({ params }: Props) {
  const { id: profileId } = await params;
  const user = await requireUserServer();
  const [result, isPro] = await Promise.all([
    getProfileSubjectsForUserAndProfile(user.id, profileId),
    getIsProForUser(user.id),
  ]);

  if (!result.ok) {
    if (result.error.code === "PROFILE_NOT_FOUND") notFound();
  }

  const subjects = result.ok ? result.value.subjects : [];
  const activeCount = subjects.filter((s) => s.status === "active").length;
  const limit = isPro ? PRO_PROFILE_SUBJECT_LIMIT : FREE_PROFILE_SUBJECT_LIMIT;
  const reachedLimit = activeCount >= limit;
  const disabledTitle = reachedLimit
    ? isPro
      ? `Cada criança pode ter até ${limit} atividades extras ativas`
      : `No plano grátis, cada criança tem ${limit} atividade extra. Pause uma para criar outra, ou conheça o Pro.`
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex items-start gap-2">
        <BackButton href="/familia" label="Voltar para as crianças" />
        <div className="flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Atividades extras</h1>
          <p className="text-sm text-muted-foreground">
            O que acontece fora da escola, como jazz, futebol, natação ou reforço. Aparece em Hoje
            junto com as aulas da turma, e dá para pausar quando a criança der um tempo, sem perder
            o histórico.
          </p>
        </div>
        <NewProfileSubjectButton
          profileId={profileId}
          disabled={reachedLimit}
          disabledTitle={disabledTitle}
        />
      </header>

      {reachedLimit ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {disabledTitle}
        </p>
      ) : null}

      <ProfileSubjectsList profileId={profileId} subjects={subjects} />
    </main>
  );
}
