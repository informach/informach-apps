import { getIsProForUser } from "@/features/billing/server-cache";
import { StudentsSection } from "@/features/students/components/students-section";
import { FREE_STUDENT_PROFILE_LIMIT, PRO_STUDENT_PROFILE_LIMIT } from "@/features/students/limits";
import { listStudentProfilesWithActiveTurmaForUser } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Perfis — Agenda da Turma",
};

export default async function PerfisPage() {
  const user = await requireUserServer();
  const [profiles, isPro] = await Promise.all([
    listStudentProfilesWithActiveTurmaForUser(user.id),
    getIsProForUser(user.id),
  ]);
  const limit = isPro ? PRO_STUDENT_PROFILE_LIMIT : FREE_STUDENT_PROFILE_LIMIT;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Perfis</h1>
        <p className="text-sm text-muted-foreground">
          Organize a rotina escolar de cada criança em um perfil separado.
        </p>
      </header>

      <StudentsSection
        profiles={profiles}
        isPro={isPro}
        currentCount={profiles.length}
        limit={limit}
      />
    </main>
  );
}
