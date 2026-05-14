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
  title: "Matérias extracurriculares — Agenda da Turma",
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
      ? `Limite de ${limit} matérias ativas por perfil`
      : `Plano Free permite ${limit} matéria por perfil. Pause uma para criar outra ou faça upgrade pro Pro.`
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex items-start gap-2">
        <BackButton href="/perfis" label="Voltar para perfis" />
        <div className="flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Matérias extracurriculares
          </h1>
          <p className="text-sm text-muted-foreground">
            Atividades fora do horário da escola — jazz, futebol, natação, reforço. Aparecem nas
            matérias do dia junto com a turma e podem ser pausadas quando seu filho dar uma pausa,
            sem perder o histórico.
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
