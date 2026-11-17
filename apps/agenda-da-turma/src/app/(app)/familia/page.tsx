import { familyAccountUrl } from "@/features/family/account-link";
import { FamilyHeader } from "@/features/family/components/family-tabs";
import { agendaAuthority } from "@/features/family/context";
import { activationOverview } from "@/features/family/context-repository";
import { extrasLine } from "@/features/profile-subjects/class-days";
import { listActiveProfileSubjectsForProfiles } from "@/features/profile-subjects/repository";
import { StudentsSection } from "@/features/students/components/students-section";
import { listStudentProfilesWithActiveTurmaForUser } from "@/features/students/service";
import { listTurmasForCurrentUser } from "@/features/turmas/service";
import { requireUserServer } from "@/lib/auth";
export const metadata = { title: "Crianças" };
export default async function FamilyChildrenPage() {
  const user = await requireUserServer();
  const actor = await agendaAuthority(user.id);
  const [profiles, activation, turmas] = await Promise.all([
    listStudentProfilesWithActiveTurmaForUser(actor),
    activationOverview(actor),
    listTurmasForCurrentUser(actor),
  ]);
  const ids = profiles.map((p) => p.id);
  const extras = await listActiveProfileSubjectsForProfiles(actor, ids);
  const extrasByProfile = Object.fromEntries(
    ids.map((id) => [id, extrasLine(extras.filter((extra) => extra.profileId === id))]),
  );
  const turmaInvites = turmas.flatMap((turma) =>
    turma.code && turma.members.some((member) => member.isActive)
      ? [
          {
            id: turma.id,
            code: turma.code,
            label: `${turma.grade.replace(/[^0-9]/g, "")}º ${turma.classLetter}`,
          },
        ]
      : [],
  );
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-[18px] px-4 pb-28 pt-[18px] md:px-8 md:pt-8">
      <FamilyHeader current="/familia" />
      <StudentsSection
        profiles={profiles}
        extrasByProfile={extrasByProfile}
        {...activation}
        accountHref={familyAccountUrl(actor.familyGroupId)}
        turmaInvites={turmaInvites}
      />
    </main>
  );
}
