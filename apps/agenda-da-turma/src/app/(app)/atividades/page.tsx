import { z } from "zod";
import { BackButton } from "@/components/app-shell/back-button";
import { ActivitiesSection } from "@/features/activities/components/activities-section";
import {
  getActivitiesCreatedCountForUser,
  getTurmasWithSubjectsForForm,
} from "@/features/activities/service";
import { getIsProForUser } from "@/features/billing/server-cache";
import { ACTION_TYPES } from "@/features/notices/schemas";
import { listStudentProfilesForUser } from "@/features/students/service";
import { overviewStatusSchema } from "@/features/unified-activities/overview-types";
import { getActivityOverview } from "@/features/unified-activities/service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Atividades — Agenda da Turma" };

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<{
    perfil?: string;
    tipo?: string;
    situacao?: string;
    recado?: string;
    pagina?: string;
  }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const [profiles, turmasForForm, isPro, activityCount] = await Promise.all([
    listStudentProfilesForUser(user.id),
    getTurmasWithSubjectsForForm(user.id),
    getIsProForUser(user.id),
    getActivitiesCreatedCountForUser(user.id),
  ]);
  const activeFilter = profiles.find((p) => p.id === params.perfil) ?? null;
  const parsedType = z.enum(ACTION_TYPES).safeParse(params.tipo);
  const filters = {
    profileFilter: activeFilter?.id ?? null,
    typeFilter: parsedType.success ? parsedType.data : null,
    statusFilter: overviewStatusSchema.catch("pending").parse(params.situacao),
    noticeId: z.string().uuid().catch("").parse(params.recado) || null,
    page: z.coerce.number().int().min(1).max(10000).catch(1).parse(params.pagina),
  };
  const result = await getActivityOverview(user.id, filters);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 pb-28 md:px-8">
      <header className="flex items-start gap-2">
        <BackButton href="/dashboard" label="Voltar à rotina" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Atividades</h1>
          <p className="text-sm text-muted-foreground">
            O que cada criança precisa fazer, em um só lugar. Cadastre uma atividade ou importe uma
            mensagem, foto da agenda ou do caderno.
          </p>
        </div>
      </header>
      <ActivitiesSection
        items={result.items}
        hasNextPage={result.hasNextPage}
        filters={filters}
        profiles={profiles}
        activeFilter={activeFilter}
        turmasForForm={turmasForForm}
        currentUserId={user.id}
        isPro={isPro}
        activityCount={activityCount}
      />
    </main>
  );
}
