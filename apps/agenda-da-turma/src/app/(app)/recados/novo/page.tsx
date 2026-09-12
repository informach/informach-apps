import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { getNoticeSource, listAssignableAdults } from "@/features/notices/repository";
import { noticeExtractionSchema } from "@/features/notices/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Organizar um recado — Agenda da Turma" };
export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const [profiles, adults, entitlement, ownerIsPro] = await Promise.all([
    listAccessibleProfiles(user.id),
    listAssignableAdults(user.id),
    getFamilyEntitlements(user.id),
    getIsProForUser(user.id),
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
      <Link href="/dashboard" className="text-sm text-muted-foreground underline">
        Voltar à rotina
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Organizar um recado</h1>
        <p className="mt-2 text-muted-foreground">
          Da publicação da escola para o que sua família precisa fazer.
        </p>
      </header>
      <CaptureForm
        key={initialNotice?.id ?? "new"}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        proProfileIds={entitlement.proProfileIds}
        ownerIsPro={ownerIsPro}
        initialNotice={initialNotice}
      />
    </main>
  );
}
