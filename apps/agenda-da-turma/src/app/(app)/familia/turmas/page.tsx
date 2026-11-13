import { FamilyHeader } from "@/features/family/components/family-tabs";
import { agendaAuthority } from "@/features/family/context";
import { listStudentProfilesForUser } from "@/features/students/service";
import { TurmasSection } from "@/features/turmas/components/turmas-section";
import { listTurmasForCurrentUser } from "@/features/turmas/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Turmas" };

export default async function FamilyTurmasPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const user = await requireUserServer();
  const actor = await agendaAuthority(user.id);
  const params = await searchParams;
  const filterProfileId = params.perfil ?? null;

  const [accessible, allTurmas] = await Promise.all([
    listStudentProfilesForUser(actor),
    listTurmasForCurrentUser(actor),
  ]);
  const profiles = accessible;

  const activeFilter = filterProfileId
    ? (profiles.find((p) => p.id === filterProfileId) ?? null)
    : null;
  const turmas = activeFilter
    ? allTurmas.filter((t) => t.members.some((m) => m.profileId === activeFilter.id))
    : allTurmas;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 pb-28 md:px-8">
      <FamilyHeader
        current="/familia/turmas"
        subtitle="Cadastre a turma de cada criança ou entre numa existente com o código."
      />
      <TurmasSection
        turmas={turmas}
        profiles={profiles}
        activeFilter={activeFilter}
        currentUserId={user.id}
      />
    </main>
  );
}
