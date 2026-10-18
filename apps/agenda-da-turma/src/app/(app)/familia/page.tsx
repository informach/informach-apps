import { getIsProForUser } from "@/features/billing/server-cache";
import { FamilyHeader } from "@/features/family/components/family-tabs";
import { getFamilyOverview } from "@/features/family/repository";
import { extrasLine } from "@/features/profile-subjects/class-days";
import { listActiveProfileSubjectsForProfiles } from "@/features/profile-subjects/repository";
import { StudentsSection } from "@/features/students/components/students-section";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";
import { listStudentProfilesWithActiveTurmaForUser } from "@/features/students/service";
import { listTurmasForCurrentUser } from "@/features/turmas/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Crianças" };

/**
 * Família › Crianças: uma folha por criança, quem cuida junto e o convite da
 * turma. Os adultos e as turmas são da conta de quem cadastrou as crianças
 * (ver o guia do app), então o adulto convidado vê só as crianças.
 */
export default async function FamilyChildrenPage() {
  const user = await requireUserServer();
  const [profiles, isPro, overview, turmas] = await Promise.all([
    listStudentProfilesWithActiveTurmaForUser(user.id),
    getIsProForUser(user.id),
    getFamilyOverview(user.id),
    listTurmasForCurrentUser(user.id),
  ]);
  // As extras de cada criança própria, para a segunda linha da folha
  // ("Natação às terças e sábados"). As extras são da conta de quem matriculou:
  // o adulto convidado não as vê, nem aqui.
  const ownIds = profiles.filter((p) => p.userId === user.id).map((p) => p.id);
  const extras = await listActiveProfileSubjectsForProfiles(ownIds);
  const extrasByProfile = Object.fromEntries(
    ownIds.map((id) => [id, extrasLine(extras.filter((extra) => extra.profileId === id))]),
  );
  const limit = isPro ? PRO_STUDENT_PROFILE_LIMIT : FREE_STUDENT_PROFILE_LIMIT;
  const own = profiles.filter((p) => p.userId === user.id);
  const isHolder = own.length > 0 || profiles.length === 0;
  const nameOf = new Map(own.map((p) => [p.id, p.name]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-[18px] px-4 pb-28 pt-[18px] md:px-8 md:pt-8">
      <FamilyHeader current="/familia" />
      <StudentsSection
        currentUserId={user.id}
        profiles={profiles}
        extrasByProfile={extrasByProfile}
        isPro={isPro}
        currentCount={own.length}
        limit={limit}
        caretakers={
          isHolder
            ? {
                you: user.name?.trim() || "Você",
                other: overview.member
                  ? {
                      name: overview.member.name,
                      sees: overview.member.profileIds.flatMap((id) => nameOf.get(id) ?? []),
                    }
                  : null,
                pendingInvites: overview.invitations.length,
              }
            : null
        }
        // O convite da turma só para quem matriculou: o código é a credencial
        // da sala, e quem foi convidado a cuidar de uma criança não consentiu
        // em distribuí-lo.
        turmaInvites={
          isHolder
            ? turmas
                .filter((turma) => turma.members.some((member) => member.isActive))
                .map((turma) => ({
                  id: turma.id,
                  code: turma.code,
                  // "3º B", como no canvas; o ano letivo mora em Turmas.
                  label: `${turma.grade.replace(/[^0-9]/g, "")}º ${turma.classLetter}`,
                }))
            : []
        }
      />
    </main>
  );
}
