import Link from "next/link";
import { z } from "zod";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { listAssignableAdults } from "@/features/notices/repository";
import { type DraftExtraction, noticeSourceSchema } from "@/features/notices/schemas";
import { getNoticeDraft } from "@/features/notices/service";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Adicionar atividade" };

/**
 * `?modo=` vem da folha Adicionar e diz por onde a pessoa escolheu entrar.
 * Não são fluxos diferentes: mudam só o subtítulo e o campo que recebe o foco.
 */
const MODE_HINTS = {
  foto: "Envie a foto da agenda, do caderno ou o anexo que a escola mandou. Você confere tudo antes de salvar.",
  colar:
    "Cole a publicação do Teams, do Batista ID ou de onde o recado chegou. Você confere tudo antes de salvar.",
  falar:
    "Dite o que a criança precisa fazer. A transcrição aparece para você conferir antes de salvar.",
} as const;
const captureModeSchema = z.enum(["foto", "colar", "falar"]);

export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string; perfil?: string; origem?: string; modo?: string }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const captureMode = captureModeSchema.safeParse(params.modo).data;
  const [profiles, adults, entitlement, ownerIsPro, subjectOptions] = await Promise.all([
    listAccessibleProfiles(user.id),
    listAssignableAdults(user.id),
    getFamilyEntitlements(user.id),
    getIsProForUser(user.id),
    listSubjectOptionsByProfile(user.id),
  ]);
  let initialNotice: { id: string; profileId: string; extraction: DraftExtraction } | undefined;
  /*
   * `?retomar=` que não resolve não derruba a tela.
   *
   * Descartar a última atividade da revisão tira o recado de `ready` e a ação
   * revalida a rotina; se esta página respondesse "não encontrado" aí, ela
   * trocaria de árvore no meio da resposta e levaria junto o que a pessoa
   * tivesse acabado de escrever à mão. Um rascunho que sumiu vira o formulário
   * de importação com um aviso — que é o que sobrou de verdade.
   */
  let resumeUnavailable = false;
  if (params.retomar) {
    const id = z.string().uuid().safeParse(params.retomar);
    // Só rascunhos `ready`, já sem as ações descartadas e com id em cada uma.
    const draft = id.success ? await getNoticeDraft(user.id, id.data) : null;
    if (
      draft?.notice.captureProfileId &&
      profiles.some((p) => p.id === draft.notice.captureProfileId)
    )
      initialNotice = {
        id: draft.notice.id,
        profileId: draft.notice.captureProfileId,
        extraction: draft.extraction,
      };
    else resumeUnavailable = true;
  }
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-8">
      <Link href="/atividades" className="text-sm text-muted-foreground underline">
        Voltar às atividades
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Adicionar atividade</h1>
        <p className="mt-2 text-muted-foreground">
          {captureMode
            ? MODE_HINTS[captureMode]
            : "Transforme mensagens, anexos e fotos da agenda ou do caderno em atividades. Confira os detalhes antes de salvar."}
        </p>
      </header>
      {resumeUnavailable ? (
        <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          Aquele rascunho não está mais aguardando revisão: ele foi salvo ou descartado. Você pode
          começar uma importação nova aqui.
        </p>
      ) : null}
      <CaptureForm
        key={initialNotice?.id ?? "new"}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        subjectOptions={subjectOptions}
        proProfileIds={entitlement.proProfileIds}
        ownerIsPro={ownerIsPro}
        initialNotice={initialNotice}
        captureMode={captureMode}
        defaultProfileId={params.perfil}
        defaultSource={noticeSourceSchema.catch("teams").parse(params.origem)}
      />
    </main>
  );
}
