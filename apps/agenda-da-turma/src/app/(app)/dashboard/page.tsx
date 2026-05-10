import { NoStudentsWidget } from "@/features/students/components/no-students-widget";
import { countUserStudentProfiles } from "@/features/students/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = {
  title: "Dashboard — Agenda da Turma",
};

export default async function DashboardPage() {
  const user = await requireUserServer();
  const profilesCount = await countUserStudentProfiles(user.id);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo de volta, {user.name ?? "responsável"}.
        </p>
      </header>

      {profilesCount === 0 ? <NoStudentsWidget /> : null}

      <p className="text-sm text-muted-foreground">Em breve: tarefas, provas e recados da turma.</p>
    </main>
  );
}
