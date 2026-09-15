import { FamilyHeader } from "@/features/family/components/family-tabs";
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
  const params = await searchParams;
  const filterProfileId = params.perfil ?? null;

  const [accessible, allTurmas] = await Promise.all([
    listStudentProfilesForUser(user.id),
    listTurmasForCurrentUser(user.id),
  ]);
  // Esta tela é da conta: a turma é cadastrada por quem matriculou a criança.
  // As demais telas de Família são por criança acessível, e é essa diferença
  // que o estado vazio precisa explicar em vez de esconder.
  const profiles = accessible.filter((p) => p.userId === user.id);

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
        caresForOtherFamilies={accessible.length > profiles.length}
        activeFilter={activeFilter}
        currentUserId={user.id}
      />
    </main>
  );
}
