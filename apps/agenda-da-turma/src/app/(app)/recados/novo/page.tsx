import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { getNoticeSource, listAssignableAdults } from "@/features/notices/repository";
import { noticeExtractionSchema, noticeSourceSchema } from "@/features/notices/schemas";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Importar mensagem ou foto — Agenda da Turma" };
export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string; perfil?: string; origem?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const [profiles, adults, entitlement, ownerIsPro, subjectOptions] = await Promise.all([
    listAccessibleProfiles(user.id),
    listAssignableAdults(user.id),
    getFamilyEntitlements(user.id),
    getIsProForUser(user.id),
    listSubjectOptionsByProfile(user.id),
  ]);
  let initialNotice:
    | { id: string; profileId: string; extraction: z.infer<typeof noticeExtractionSchema> }
    | undefined;
  if (params.retomar) {
    if (!z.string().uuid().safeParse(params.retomar).success) notFound();
    const notice = await getNoticeSource(user.id, params.retomar);
    if (
      !notice ||
      notice.status !== "ready" ||
      !notice.captureProfileId ||
      !profiles.some((p) => p.id === notice.captureProfileId)
    )
      notFound();
    const parsed = noticeExtractionSchema.safeParse(notice.parsedResult);
    if (!parsed.success) notFound();
    initialNotice = { id: notice.id, profileId: notice.captureProfileId, extraction: parsed.data };
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <Link href="/atividades" className="text-sm text-muted-foreground underline">
        Voltar às atividades
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importar mensagem ou foto</h1>
        <p className="mt-2 text-muted-foreground">
          Transforme mensagens, anexos e fotos da agenda ou do caderno em atividades. Confira os
          detalhes antes de salvar.
        </p>
      </header>
      <CaptureForm
        key={initialNotice?.id ?? "new"}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        subjectOptions={subjectOptions}
        proProfileIds={entitlement.proProfileIds}
        ownerIsPro={ownerIsPro}
        initialNotice={initialNotice}
        defaultProfileId={params.perfil}
        defaultSource={noticeSourceSchema.catch("teams").parse(params.origem)}
      />
    </main>
  );
}
