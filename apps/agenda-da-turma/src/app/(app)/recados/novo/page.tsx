import { z } from "zod";
import { BackButton } from "@/components/app-shell/back-button";
import { getIsProForUser } from "@/features/billing/server-cache";
import { listAccessibleProfiles } from "@/features/family/access";
import { getFamilyEntitlements } from "@/features/family/entitlements";
import { CaptureForm } from "@/features/notices/components/capture-form";
import { listAssignableAdults } from "@/features/notices/repository";
import { type DraftExtraction, noticeSourceSchema } from "@/features/notices/schemas";
import { getNoticeDraft } from "@/features/notices/service";
import { getNotificationPreferences } from "@/features/notifications/service";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Trazer um recado" };

/**
 * `?modo=` vem da folha "O que chegou?" e diz por onde a pessoa escolheu
 * entrar. Não são fluxos diferentes: muda o que vem primeiro na tela (a
 * câmera, o campo de colar, o microfone) e o que recebe o foco.
 */
const captureModeSchema = z.enum(["foto", "colar", "falar", "compartilhado"]);

export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{
    retomar?: string;
    perfil?: string;
    origem?: string;
    modo?: string;
    texto?: string;
  }>;
}) {
  const user = await requireUserServer();
  const params = await searchParams;
  const captureMode = captureModeSchema.safeParse(params.modo).data;
  const [profiles, adults, entitlement, ownerIsPro, subjectOptions, notificationPrefs] =
    await Promise.all([
      listAccessibleProfiles(user.id),
      listAssignableAdults(user.id),
      getFamilyEntitlements(user.id),
      getIsProForUser(user.id),
      listSubjectOptionsByProfile(user.id),
      getNotificationPreferences(user.id),
    ]);
  let initialNotice:
    | {
        id: string;
        profileId: string;
        source: z.infer<typeof noticeSourceSchema>;
        extraction: DraftExtraction;
      }
    | undefined;
  /*
   * `?retomar=` que não resolve não derruba a tela.
   *
   * Descartar a última atividade da revisão tira o recado de `ready` e a ação
   * revalida a rotina; se esta página respondesse "não encontrado" aí, ela
   * trocaria de árvore no meio da resposta e levaria junto o que a pessoa
   * tivesse acabado de escrever à mão. Um rascunho que sumiu vira o formulário
   * de um recado novo com um aviso, que é o que sobrou de verdade.
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
        source: draft.notice.source,
        extraction: draft.extraction,
      };
    else resumeUnavailable = true;
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-5 sm:px-8 sm:pt-8">
      <div className="flex items-center gap-2">
        <BackButton href="/dashboard" label="Voltar para Hoje" />
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          Trazer um recado
        </h1>
      </div>
      <CaptureForm
        /*
         * A chave são os PARÂMETROS da URL, não o rascunho resolvido.
         *
         * Descartar a última atividade tira o recado de `ready`; na
         * re-renderização seguinte `initialNotice` some, e uma chave derivada
         * dele mudaria de `<id>` para `"new"`, remontando o formulário e
         * levando junto o que a pessoa tivesse escrito à mão. Pelos
         * parâmetros, a tela continua a mesma enquanto a URL for a mesma.
         *
         * `texto` entra na chave porque `defaultText` é lido só como estado
         * INICIAL: numa navegação de cliente entre duas URLs de texto colado,
         * sem remontagem, o conteúdo da primeira ficaria na tela.
         */
        key={[params.retomar, params.texto ? "colado" : ""].filter(Boolean).join("|") || "new"}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        adults={adults}
        subjectOptions={subjectOptions}
        profileTurmas={Object.fromEntries(profiles.map((p) => [p.id, p.activeTurmaId]))}
        suggestReminders={notificationPrefs.suggestReminders}
        proProfileIds={entitlement.proProfileIds}
        ownerIsPro={ownerIsPro}
        initialNotice={initialNotice}
        captureMode={captureMode}
        defaultProfileId={params.perfil}
        defaultText={typeof params.texto === "string" ? params.texto.slice(0, 4000) : undefined}
        defaultSource={noticeSourceSchema.catch("teams").parse(params.origem)}
        resumeUnavailable={resumeUnavailable}
      />
    </main>
  );
}
