import Link from "next/link";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { listAssignableAdults } from "@/features/notices/repository";
import { activityTypeSchema } from "@/features/unified-activities/activity-types";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Nova atividade — Agenda da Turma" };
export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string; tipo?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const [profiles, adults, entitlement, ownerIsPro] = await Promise.all([
    listAccessibleProfiles(user.id),
    listAssignableAdults(user.id),
    getFamilyEntitlements(user.id),
    getIsProForUser(user.id),
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
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        proProfileIds={entitlement.proProfileIds}
        ownerIsPro={ownerIsPro}
        defaultProfileId={params.perfil}
        defaultType={activityTypeSchema.catch("task").parse(params.tipo)}
      />
    </main>
  );
}
