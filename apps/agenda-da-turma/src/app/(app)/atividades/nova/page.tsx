import Link from "next/link";
import { isValidLocalIsoDate } from "@/features/dashboard/date";
import { listAccessibleProfiles } from "@/features/family/access";
import { agendaAuthority } from "@/features/family/context";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { listAssignableAdults } from "@/features/notices/repository";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { activityTypeSchema } from "@/features/unified-activities/activity-types";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Nova atividade" };
export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string; tipo?: string; data?: string }>;
}) {
  const user = await requireUserServer();
  const actor = await agendaAuthority(user.id);
  const params = await searchParams;
  const [profiles, adults, entitlement, subjectOptions] = await Promise.all([
    listAccessibleProfiles(actor),
    listAssignableAdults(actor),
    getFamilyEntitlements(actor),
    listSubjectOptionsByProfile(actor),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <Link href="/atividades" className="text-sm text-muted-foreground underline">
        Voltar às atividades
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nova atividade</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha a criança e o tipo de atividade. Você pode deixar o prazo para confirmar depois.
        </p>
      </header>
      <CaptureForm
        mode="manual"
        subjectOptions={subjectOptions}
        profileTurmas={Object.fromEntries(profiles.map((p) => [p.id, p.activeTurmaId]))}
        profiles={profiles.filter((p) => p.canWrite).map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        proProfileIds={entitlement.proProfileIds}
        aiProfileIds={profiles.filter((p) => p.canWrite && p.canUseAi).map((p) => p.id)}
        defaultProfileId={params.perfil}
        defaultType={activityTypeSchema.catch("task").parse(params.tipo)}
        defaultDueAt={isValidLocalIsoDate(params.data ?? "") ? params.data : undefined}
      />
    </main>
  );
}
