"use client";

import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { handleAiHttpError } from "@/features/ai/_http-errors";
import { todayLocalIso } from "@/features/dashboard/date";
import { createStudentProfileAction } from "@/features/students/actions";
import type { SubjectOptionsByProfile } from "@/features/subjects/options-service";
import { catchActionResult } from "@/lib/action-result";
import { confirmNoticeAction, discardDraftActionAction } from "../actions";
import { draftFromExtractedAction } from "../draft-from-extraction";
import { noticeErrorMessage } from "../messages";
import { buildPdfFromPhotos, MAX_PHOTOS, type Photo } from "../photo-pdf";
import {
  clampNoticeText,
  confirmNoticeSchema,
  type DraftExtraction,
  draftExtractionSchema,
  NOTICE_TEXT_MAX,
  type NoticeActionInput,
  noticeSourceSchema,
  parseNoticeSchema,
  SOURCE_LABELS,
} from "../schemas";
import { sharedPayloadText, takeSharedPayload } from "../share-target";
import {
  buildNoticeTextFromMessages,
  latestMessageDate,
  parseWhatsAppExport,
  type WhatsAppMessage,
} from "../whatsapp-export";
import { ActionFields, type AssignableAdult, type RoutineProfile } from "./action-fields";
import { DiscardNoticeDialog } from "./discard-notice-dialog";
import { WhatsAppPicker } from "./whatsapp-picker";

/**
 * `actionId` é o id da ação no rascunho guardado no servidor. Só as ações lidas
 * pela IA o têm; as acrescentadas nesta tela existem só aqui até salvar.
 * `subjectHint` é a matéria como a leitura a reconheceu — a revisão mostra
 * quando ela não casou com nenhuma cadastrada.
 */
type Draft = {
  key: string;
  value: NoticeActionInput;
  actionId?: string;
  subjectHint?: string | null;
};
function blankAction(
  profileId: string,
  type: NoticeActionInput["type"] = "task",
  key = crypto.randomUUID(),
  dueAt: string | null = null,
): Draft {
  return {
    key,
    value: {
      profileId,
      type,
      title: "",
      description: null,
      subjectId: null,
      profileSubjectId: null,
      dueAt,
      dateOrigin: dueAt ? "family" : "unspecified",
      time: null,
      estimatedMinutes: null,
      location: null,
      sourceExcerpt: null,
      assignedToUserId: null,
      reminderAt: null,
      recurrence: "none",
      shareWithTurma: false,
    },
  };
}
const responseSchema = z.object({
  noticeId: z.string().uuid(),
  extraction: draftExtractionSchema,
  alreadyConfirmed: z.boolean(),
  replay: z.boolean(),
  appliedProfileIds: z.array(z.string().uuid()).default([]),
  sourceProfileIds: z.array(z.string().uuid()).nullable().optional(),
});

export function CaptureForm({
  profiles: initialProfiles,
  adults,
  subjectOptions,
  profileTurmas,
  suggestReminders = false,
  proProfileIds,
  ownerIsPro,
  initialNotice,
  mode = "capture",
  captureMode,
  defaultProfileId,
  defaultType = "task",
  defaultDueAt,
  defaultSource = "teams",
  defaultText = "",
  defaultAttachment,
}: {
  profiles: RoutineProfile[];
  adults: AssignableAdult[];
  subjectOptions: SubjectOptionsByProfile;
  /** Turma ativa de cada criança: o caminho de saída quando não há matérias. */
  profileTurmas: Record<string, string | null>;
  /** Preferência da casa: preencher o lembrete sugerido nas importações. */
  suggestReminders?: boolean;
  proProfileIds: string[];
  ownerIsPro: boolean;
  mode?: "capture" | "manual";
  /**
   * Caminho escolhido na folha Adicionar. Só decide o que recebe o foco ao
   * abrir — todos os caminhos usam o mesmo formulário e a mesma revisão.
   */
  captureMode?: "foto" | "colar" | "falar" | "compartilhado";
  defaultProfileId?: string;
  defaultType?: NoticeActionInput["type"];
  /** Dia escolhido no calendário: a atividade já nasce com ele. */
  defaultDueAt?: string;
  defaultSource?: z.infer<typeof noticeSourceSchema>;
  /** Texto já vindo do compartilhamento pela rota de segurança. */
  defaultText?: string;
  /** Anexo de uma mensagem encaminhada por e-mail. */
  defaultAttachment?: { name: string; dataUrl: string };
  /**
   * Mensagem da caixa de e-mail que originou esta captura.
   *
   * Vai junto com a confirmação: ao salvar, a mensagem sai de "Chegou por
   * e-mail" e passa a apontar para o recado que nasceu dela.
   */
  initialNotice?: {
    id: string;
    profileId: string;
    source: z.infer<typeof noticeSourceSchema>;
    extraction: DraftExtraction;
  };
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [profileId, setProfileId] = useState(
    initialNotice?.profileId ??
      initialProfiles.find((p) => p.id === defaultProfileId)?.id ??
      initialProfiles[0]?.id ??
      "",
  );
  const isPro =
    proProfileIds.includes(profileId) ||
    (ownerIsPro && !initialProfiles.some((p) => p.id === profileId));
  const [childName, setChildName] = useState("");
  const [source, setSource] = useState<z.infer<typeof noticeSourceSchema>>(
    // Quem entra por "Foto ou arquivo" — ou por um compartilhamento do sistema
    // — está, na maioria das vezes, mandando a agenda ou o caderno; é o que o
    // próprio texto da tela diz. Deixar "Teams" aqui marcava como publicação da
    // escola a letra de uma criança, e com o compartilhamento automático isso
    // iria para a turma inteira. Quem tiver recebido o anexo da escola troca a
    // origem no campo ao lado.
    initialNotice?.source ??
      (captureMode === "foto" || captureMode === "compartilhado" ? "notebook" : defaultSource),
  );
  /**
   * Compartilhar com a turma nasce marcado quando faz sentido para ela: matéria
   * da turma, prazo da escola e Pro. Anotação de caderno nunca — ali é a letra
   * de uma criança, não o enunciado que a escola mandou para todo mundo.
   */
  /** A criança é de uma casa Pro? (Perfil convidado herda o plano do titular.) */
  const isProForProfile = (pid: string) =>
    proProfileIds.includes(pid) || (ownerIsPro && !initialProfiles.some((p) => p.id === pid));
  const sharesByDefault = (pid: string, origin: z.infer<typeof noticeSourceSchema>) =>
    origin !== "notebook" && isProForProfile(pid);
  const [sourceUrl, setSourceUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  // Todo caminho que escreve texto sem passar pelo teclado passa por aqui: o
  // `maxLength` do campo não alcança o que o código escreve, e ultrapassar o
  // teto deixava a importação impossível de enviar.
  const [rawText, setRawTextState] = useState(defaultText);
  const text = clampNoticeText(rawText ?? "");
  const setText = (next: string | ((current: string) => string)) =>
    setRawTextState((current) =>
      clampNoticeText(typeof next === "function" ? next(clampNoticeText(current ?? "")) : next),
    );
  const textWasTrimmed = (rawText ?? "").length > NOTICE_TEXT_MAX;
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(
    defaultAttachment ?? null,
  );
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState<number[]>([]);
  /** Fotos de um mesmo recado: duas ou mais viram um PDF só. */
  const [photos, setPhotos] = useState<Photo[]>([]);
  /** Conversa exportada do WhatsApp aguardando a escolha das mensagens. */
  const [whatsAppMessages, setWhatsAppMessages] = useState<WhatsAppMessage[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initialNotice
      ? initialNotice.extraction.actions.map(({ id, ...item }, index) => ({
          key: id ?? `resume-${index}`,
          actionId: id,
          // A pista de matéria casa com a lista atual da criança, mesmo num
          // rascunho retomado: matéria cadastrada depois da leitura ainda vale.
          ...draftFromExtractedAction(
            item,
            initialNotice.profileId,
            subjectOptions[initialNotice.profileId] ?? [],
            {
              // Mesmos predicados da importação nova: a cópia inline que morava
              // aqui era a mesma expressão escrita duas vezes, e retomar um
              // rascunho é exatamente o caminho em que ninguém olharia se as
              // duas tivessem divergido.
              defaultShare: sharesByDefault(initialNotice.profileId, initialNotice.source),
              suggestReminders: suggestReminders && isProForProfile(initialNotice.profileId),
              todayIso: todayLocalIso(),
            },
          ),
        }))
      : mode === "manual" && profileId
        ? [blankAction(profileId, defaultType, "manual-initial", defaultDueAt ?? null)]
        : [],
  );
  const [noticeId, setNoticeId] = useState<string | null>(initialNotice?.id ?? null);
  const [warnings, setWarnings] = useState<string[]>(initialNotice?.extraction.warnings ?? []);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string }>>([]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [appliedProfileIds, setAppliedProfileIds] = useState<string[]>([]);
  const [shareOriginal, setShareOriginal] = useState(false);
  const [sourceProfileIds, setSourceProfileIds] = useState<string[]>([]);
  const [publicationReference, setPublicationReference] = useState(
    initialNotice?.extraction.publicationReference ?? null,
  );
  const [corrections, setCorrections] = useState<
    Array<{
      index: number;
      id: string;
      title: string;
      dueAt: string | null;
      version: number;
      profileId: string;
    }>
  >([]);
  const [resolutions, setResolutions] = useState<
    NonNullable<z.infer<typeof confirmNoticeSchema>["resolutions"]>
  >([]);
  const [busy, setBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** Replay de um recado já confirmado: não há rascunho no servidor. */
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);

  /**
   * Anexo que já chegou pronto (e-mail encaminhado): o seletor de páginas
   * depende de saber quantas são.
   *
   * A trava é a `ref`, não o array de dependências. `defaultAttachment` vem
   * desserializado do servidor e muda de IDENTIDADE a cada `router.refresh()` —
   * e o esvaziamento da fila offline dispara um. Sem a trava, o efeito rodava
   * no meio da revisão e `countPdfPages` zerava as páginas que a pessoa tinha
   * acabado de marcar, derrubando o envio com "confira os campos" e sem dizer
   * que a escolha dela tinha sido apagada.
   */
  const countedAttachment = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a trava é a ref, ver acima
  useEffect(() => {
    if (countedAttachment.current) return;
    if (!defaultAttachment?.dataUrl.startsWith("data:application/pdf")) return;
    countedAttachment.current = true;
    void countPdfPages(defaultAttachment.dataUrl).catch(() =>
      setError(noticeErrorMessage("INVALID_ATTACHMENT")),
    );
  }, [defaultAttachment]);

  /**
   * Compartilhamento do sistema: o service worker guardou no aparelho e a
   * navegação chegou aqui. Buscar uma vez, e apagar — recado compartilhado não
   * pode reaparecer na próxima importação.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na montagem, ver acima
  useEffect(() => {
    if (captureMode !== "compartilhado") return;
    let active = true;
    void (async () => {
      const payload = await takeSharedPayload();
      if (!active || !payload) return;
      const shared = sharedPayloadText(payload);
      if (shared) setText((current) => (current.trim() ? current : shared));
      if (!payload.file) return;
      const file = new File([payload.file.blob], payload.file.name, { type: payload.file.type });
      await chooseFile(file);
    })();
    return () => {
      active = false;
    };
    // Só na montagem: a leitura consome o que estava guardado.
  }, [captureMode]);
  // O caminho escolhido na folha Adicionar leva o foco ao controle
  // correspondente. Sem isto, quem toca em "Falar" cai num formulário longo e
  // precisa caçar o microfone abaixo do campo de texto — exatamente o atrito
  // que a folha existe para remover.
  useEffect(() => {
    if (!captureMode) return;
    const targetId =
      captureMode === "foto"
        ? "notice-file"
        : captureMode === "falar"
          ? "notice-voice"
          : "notice-text";
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }, [captureMode]);

  function resetDecisions() {
    setCorrections([]);
    setResolutions([]);
    setDuplicates([]);
    setAllowDuplicates(false);
  }
  function resetToImport() {
    setDrafts([]);
    setNoticeId(null);
    setNoticeConfirmed(false);
    setWarnings([]);
    setAppliedProfileIds([]);
    setSourceProfileIds([]);
    setShareOriginal(false);
    setPublicationReference(null);
    resetDecisions();
  }
  function dropDraftLocally(key: string) {
    // Atualização funcional: a pessoa pode ter editado ou acrescentado outra
    // atividade enquanto o descarte ia ao servidor, e uma lista capturada
    // antes do `await` desfaria o que ela acabou de escrever.
    setDrafts((current) => current.filter((d) => d.key !== key));
    resetDecisions();
  }
  async function removeDraft(draft: Draft) {
    const currentNoticeId = noticeId;
    const actionId = draft.actionId;
    // Ação lida pela IA num rascunho ainda por salvar: o descarte precisa
    // chegar ao servidor, senão ela volta inteira ao retomar. Ação escrita
    // nesta tela — ou de um recado já salvo, revisado para outra criança —
    // existe só aqui.
    if (currentNoticeId && actionId) {
      setError("");
      setBusy(true);
      const result = await catchActionResult(() =>
        discardDraftActionAction({ noticeId: currentNoticeId, actionId }),
      );
      setBusy(false);
      if (!result.ok) {
        setError(noticeErrorMessage(result.error.code));
        return;
      }
      if (result.value.remaining === 0) {
        toast.success("Recado descartado.");
        // O recado virou `discarded`. O que a pessoa escreveu à mão nesta tela
        // continua valendo e vira um cadastro manual; só quando não sobra nada
        // a tela volta ao passo de importação, e aí a URL é limpa — a página
        // trata um `?retomar=` vencido com um aviso, não com um erro.
        setNoticeId(null);
        const others = drafts.filter((d) => d.key !== draft.key);
        if (others.length === 0) {
          resetToImport();
          if (initialNotice) router.replace("/recados/novo");
          return;
        }
      }
    }
    dropDraftLocally(draft.key);
  }

  async function addChild() {
    setBusy(true);
    setError("");
    const result = await catchActionResult(() =>
      createStudentProfileAction({ name: childName.trim(), birthDate: null }),
    );
    setBusy(false);
    if (!result.ok) {
      setError("Não foi possível criar o perfil. Confira o nome e o limite do seu plano.");
      return;
    }
    setProfiles([...profiles, { id: result.value.id, name: childName.trim() }]);
    setProfileId(result.value.id);
    if (mode === "manual") setDrafts([blankAction(result.value.id, defaultType)]);
    router.refresh();
  }
  /**
   * Transcreve o ditado e devolve o texto para o campo acima. A leitura do
   * recado continua sendo um passo separado, que a pessoa dispara depois de
   * conferir a transcrição — ditar errado não gasta a interpretação.
   */
  async function transcribeAudio(blob: Blob): Promise<string> {
    if (!profileId) return "";
    setError("");
    const body = new FormData();
    body.append("audio", blob, "recado.webm");
    const response = await fetch(
      `/api/ai/activities/transcribe?perfil=${encodeURIComponent(profileId)}`,
      { method: "POST", body },
    );
    if (!response.ok) {
      // A rota distingue "acabou a franquia" de "o áudio falhou": repetir só
      // resolve no segundo caso, então a mensagem precisa ser a certa.
      const probe = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: string } | null;
      if (probe?.code && probe.code !== "SUBSCRIPTION_REQUIRED" && probe.code !== "RATE_LIMITED") {
        toast.error(noticeErrorMessage(probe.code));
        return "";
      }
      if (!handleAiHttpError(response)) return "";
      toast.error(noticeErrorMessage("TRANSCRIBE_FAILED"));
      return "";
    }
    const data = (await response.json().catch(() => null)) as { text?: string } | null;
    const transcript = (data?.text ?? "").trim();
    if (!transcript) toast.error("Não entendi o áudio. Fale um pouco mais perto do microfone.");
    return transcript;
  }

  /**
   * Quantas páginas tem o PDF, e quais vão para a leitura.
   *
   * Vale para o arquivo escolhido aqui E para o que já chegou pronto (o anexo
   * de um e-mail encaminhado): sem isto, um PDF de quatro páginas vindo por
   * e-mail não mostrava o seletor de páginas e era recusado no envio, com um
   * erro sobre o qual a pessoa não podia fazer nada.
   */
  async function countPdfPages(dataUrl: string) {
    const { PDFDocument } = await import("pdf-lib");
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
    const pdf = await PDFDocument.load(bytes);
    const count = pdf.getPageCount();
    if (count > 500) throw new Error("PDF_TOO_LONG");
    setPageCount(count);
    setPages(count <= 3 ? Array.from({ length: count }, (_, i) => i + 1) : []);
  }

  async function chooseFile(file: File | undefined) {
    setAttachment(null);
    setPageCount(0);
    setPages([]);
    setError("");
    setPhotos([]);
    setWhatsAppMessages(null);
    if (!file) return;
    // Conversa exportada do WhatsApp: não é anexo, é uma lista de mensagens
    // para a pessoa escolher. O grupo inteiro nunca vai para a leitura.
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      if (file.size > 5 * 1024 * 1024) {
        setError(noticeErrorMessage("INVALID_ATTACHMENT"));
        return;
      }
      const messages = parseWhatsAppExport(await file.text());
      if (!messages.length) {
        setError(
          "Não encontrei mensagens nesse arquivo. Exporte a conversa pelo WhatsApp, sem mídia.",
        );
        return;
      }
      setWhatsAppMessages(messages);
      setSource("whatsapp");
      return;
    }
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)
    ) {
      setError(noticeErrorMessage("INVALID_ATTACHMENT"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("FILE"));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (file.type === "application/pdf") await countPdfPages(dataUrl);
      setAttachment({ name: file.name, dataUrl });
    } catch {
      setError(noticeErrorMessage("INVALID_ATTACHMENT"));
    } finally {
      setBusy(false);
    }
  }
  /**
   * Acrescenta uma foto ao mesmo recado.
   *
   * Agenda de duas páginas, comunicado de três: até aqui cada foto era uma
   * importação (e uma cobrança) à parte, e as atividades saíam desconexas.
   */
  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(noticeErrorMessage("INVALID_ATTACHMENT"));
      return;
    }
    setError("");
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("FILE"));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const current = photos.length
        ? photos
        : attachment?.dataUrl.startsWith("data:image/")
          ? [{ name: attachment.name, dataUrl: attachment.dataUrl }]
          : [];
      const next = [...current, { name: file.name, dataUrl }].slice(0, MAX_PHOTOS);
      const pdf = await buildPdfFromPhotos(next);
      setPhotos(next);
      setPageCount(next.length);
      setPages(next.map((_, index) => index + 1));
      setAttachment(pdf);
      setSource((currentSource) => (currentSource === "teams" ? "notebook" : currentSource));
    } catch (error) {
      setError(
        error instanceof Error && error.message === "PHOTOS_TOO_LARGE"
          ? "As fotos juntas passam de 5 MB. Envie menos páginas ou uma foto de cada vez."
          : noticeErrorMessage("INVALID_ATTACHMENT"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function extract() {
    setError("");
    resetDecisions();
    const input = parseNoticeSchema.safeParse({
      profileId,
      source,
      sourceUrl: sourceUrl || null,
      publishedAt: publishedAt || null,
      text,
      attachment: attachment ? { ...attachment, ...(pageCount ? { pages } : {}) } : null,
    });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/recados/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const json: unknown = await response.json();
      const result = responseSchema.safeParse(json);
      if (!response.ok || !result.success) {
        const failure = z.object({ code: z.string() }).safeParse(json);
        setError(noticeErrorMessage(failure.success ? failure.data.code : "PARSE_FAILED"));
        return;
      }
      setAppliedProfileIds(result.data.appliedProfileIds);
      setSourceProfileIds(result.data.sourceProfileIds ?? []);
      setShareOriginal(false);
      setPublicationReference(result.data.extraction.publicationReference ?? null);
      setNoticeId(result.data.noticeId);
      setNoticeConfirmed(result.data.alreadyConfirmed);
      // A mensagem encaminhada cumpriu o papel: quem acompanha daqui em diante
      // é o card de rascunhos, e a mesma pendência não fica em duas listas.
      setWarnings(result.data.extraction.warnings);
      setDrafts(
        result.data.extraction.actions.map(({ id, ...item }) => ({
          key: id ?? crypto.randomUUID(),
          // Recado já salvo, sendo revisado para outra criança: não há mais
          // rascunho no servidor para descartar. A lixeira volta a ser local,
          // senão ela responderia "já foi salvo" e não removeria nada.
          actionId: result.data.alreadyConfirmed ? undefined : id,
          ...draftFromExtractedAction(item, profileId, subjectOptions[profileId] ?? [], {
            defaultShare: sharesByDefault(profileId, source),
            suggestReminders: suggestReminders && isPro,
            todayIso: todayLocalIso(),
          }),
        })),
      );
    } catch {
      setError(
        "A conexão foi interrompida. Envie o mesmo recado novamente para recuperar o resultado.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setError("");
    const parsed = confirmNoticeSchema.safeParse({
      noticeId,
      actions: drafts.map((d) => d.value),
      allowDuplicates,
      resolutions,
      sourceProfileIds: shareOriginal
        ? [...new Set([...sourceProfileIds, ...drafts.map((d) => d.value.profileId)])]
        : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    setBusy(true);
    const result = await catchActionResult(() => confirmNoticeAction(parsed.data));
    setBusy(false);
    if (!result.ok) {
      setError(noticeErrorMessage(result.error.code));
      if (result.error.code === "POSSIBLE_DUPLICATES") setDuplicates(result.error.duplicates);
      if (result.error.code === "POSSIBLE_CORRECTIONS") setCorrections(result.error.candidates);
      if (result.error.code === "VERSION_CONFLICT" || result.error.code === "INVALID_CORRECTION") {
        setCorrections([]);
        setResolutions([]);
      }
      return;
    }
    const savedProfileIds = [...new Set(parsed.data.actions.map((item) => item.profileId))];
    router.push(
      savedProfileIds.length === 1 ? `/atividades?perfil=${savedProfileIds[0]}` : "/atividades",
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!profiles.length ? (
        <section key="create-profile" className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Comece pelo nome da criança</h2>
          <p className="text-sm text-muted-foreground">Você pode informar escola e turma depois.</p>
          <label htmlFor="child-name" className="grid gap-2 text-sm font-medium">
            Nome
            <Input
              id="child-name"
              value={childName}
              maxLength={80}
              onChange={(e) => setChildName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button onClick={addChild} disabled={busy || childName.trim().length < 2}>
            Criar perfil
          </Button>
        </section>
      ) : whatsAppMessages ? (
        <WhatsAppPicker
          key="whatsapp-picker"
          messages={whatsAppMessages}
          busy={busy}
          onCancel={() => setWhatsAppMessages(null)}
          onUse={(picked) => {
            // O texto leva a data de cada mensagem, e a mais recente vira a
            // publicação: sem isso, um "entregar amanhã" de terça vira um
            // prazo de hoje.
            // `setText` corta no teto: dez mensagens longas passam de 16 000
            // caracteres com facilidade, e o corte aqui é melhor do que uma
            // recusa do Zod depois, sem saída.
            setText(buildNoticeTextFromMessages(picked));
            // Só quando as mensagens escolhidas trazem data: apagar o que a
            // pessoa digitou à mão seria perder a referência de publicação.
            const latest = latestMessageDate(picked);
            if (latest) setPublishedAt(latest);
            setWhatsAppMessages(null);
          }}
        />
      ) : !drafts.length ? (
        <section key="capture-notice" className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="notice-child" className="grid gap-2 text-sm font-medium">
              Para qual criança?
              <select
                id="notice-child"
                className="h-11 rounded-md border bg-background px-3"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="notice-source" className="grid gap-2 text-sm font-medium">
              O que você vai importar?
              <select
                id="notice-source"
                className="h-11 rounded-md border bg-background px-3"
                value={source}
                onChange={(e) => {
                  const parsed = noticeSourceSchema.safeParse(e.target.value);
                  if (parsed.success) setSource(parsed.data);
                }}
              >
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor="notice-text" className="grid gap-2 text-sm font-medium">
            {source === "notebook"
              ? "Observação para acompanhar a foto (opcional)"
              : "Cole a mensagem ou publicação (opcional se enviar um arquivo)"}
            <textarea
              id="notice-text"
              className="min-h-40 rounded-md border bg-background p-3 font-normal"
              placeholder="Ex.: O passeio será na sexta-feira. Entreguem a autorização até quarta..."
              value={text}
              maxLength={NOTICE_TEXT_MAX}
              onChange={(e) => setText(e.target.value)}
            />
            {/* Cortar em silêncio seria pior: a pessoa mandaria ler metade de
                um e-mail achando que mandou o todo. */}
            {textWasTrimmed ? (
              <p role="status" className="text-sm font-normal text-muted-foreground">
                O recado é maior do que cabe numa leitura e foi cortado no começo dele. Confira o
                que ficou e apague o que não for necessário.
              </p>
            ) : null}
          </label>
          {/*
            Ditar escreve no mesmo campo de texto, e não num fluxo paralelo: a
            transcrição fica visível para conferência antes de gastar a leitura
            do recado. Até aqui a voz só existia no caminho Pro por matéria, que
            exigia turma cadastrada e nunca chegava a quem estava começando.
          */}
          <div className="flex items-center gap-3 rounded-lg border border-chart-3/30 bg-chart-3/5 p-3">
            {/* `SpeechInput` é um botão só de ícone: o rótulo visível vive ao
                lado, e o acessível vem do aria-label. */}
            <SpeechInput
              id="notice-voice"
              type="button"
              variant="outline"
              aria-label="Ditar a atividade"
              className="size-11 shrink-0 rounded-full"
              disabled={busy || !profileId}
              maxDurationMs={120_000}
              onAudioRecorded={transcribeAudio}
              onTranscriptionChange={(value) => {
                const next = value.trim();
                if (!next) return;
                setText((prev) => (prev.trim() ? `${prev.trim()}\n${next}` : next));
              }}
              onError={() => toast.error("Não consegui acessar o microfone. Confira a permissão.")}
            />
            <p className="text-sm">
              <span className="font-medium">Ditar a atividade.</span>{" "}
              <span className="text-muted-foreground">
                Fale o que a criança precisa fazer. O texto aparece acima para você conferir antes
                de salvar.
              </span>
            </p>
          </div>
          <label htmlFor="notice-file" className="grid gap-2 text-sm font-medium">
            Foto ou arquivo
            <Input
              id="notice-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt"
              disabled={busy}
              onChange={(e) => {
                void chooseFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="font-normal text-muted-foreground">
              Envie a foto da agenda, do caderno ou o anexo da escola. Não precisa digitar o que
              está na foto. JPG, PNG, WebP ou PDF, até 5 MB. O arquivo original fica disponível por
              30 dias. Exportou a conversa do grupo pelo WhatsApp? Envie o .txt e escolha as
              mensagens.
            </span>
          </label>
          <div className="space-y-3">
            <label
              htmlFor="notice-camera"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
            >
              <Camera className="size-4" aria-hidden /> Usar a câmera
              <input
                id="notice-camera"
                className="sr-only"
                type="file"
                capture="environment"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  setSource("notebook");
                  void chooseFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {attachment && (photos.length || attachment.dataUrl.startsWith("data:image/")) ? (
              <label
                htmlFor="notice-more-photos"
                className="ml-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
              >
                <Plus className="size-4" aria-hidden />
                Adicionar outra foto
                <input
                  id="notice-more-photos"
                  className="sr-only"
                  type="file"
                  capture="environment"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || photos.length >= MAX_PHOTOS}
                  onChange={(e) => {
                    void addPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
            {attachment ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="break-words text-sm">
                  {photos.length > 1
                    ? `${photos.length} fotos num PDF só: ${attachment.name}`
                    : `Arquivo selecionado: ${attachment.name}`}
                </p>
                {attachment.dataUrl.startsWith("data:image/") ? (
                  <Image
                    src={attachment.dataUrl}
                    alt="Foto selecionada para leitura"
                    width={800}
                    height={600}
                    unoptimized
                    className="max-h-72 w-full rounded-md object-contain"
                  />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setAttachment(null);
                    setPageCount(0);
                    setPages([]);
                  }}
                >
                  Remover arquivo
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Fotografe a página inteira, com boa luz e sem cortar as anotações. Letras ou prazos
              pouco claros precisam de conferência.
            </p>
          </div>
          {pageCount > 0 ? (
            <fieldset className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">
                PDF com {pageCount} páginas. Selecione até 3
              </legend>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
                  <label
                    key={page}
                    className="flex min-h-11 items-center gap-2 rounded border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={pages.includes(page)}
                      disabled={pages.length >= 3 && !pages.includes(page)}
                      onChange={(e) =>
                        setPages(
                          e.target.checked
                            ? [...pages, page].sort((a, b) => a - b)
                            : pages.filter((p) => p !== page),
                        )
                      }
                    />
                    {page}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="notice-published" className="grid gap-2 text-sm font-medium">
              {source === "notebook"
                ? "Data da anotação (se conhecida)"
                : "Data da publicação (se conhecida)"}
              <Input
                id="notice-published"
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
              <span className="font-normal text-muted-foreground">
                Use a data em que a anotação ou mensagem foi escrita. Ela ajuda a interpretar
                “amanhã”; a data da foto não define o prazo.
              </span>
            </label>
            <label htmlFor="notice-url" className="grid gap-2 text-sm font-medium">
              Link do original (opcional)
              <Input
                id="notice-url"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
              <span className="font-normal text-muted-foreground">
                Pode exigir acesso à conta da escola.
              </span>
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            {isPro
              ? "1 crédito por importação, mesmo com várias atividades; ditar usa 2."
              : "Experimente 5 importações gratuitas, sem cartão. Depois, o Pro inclui 70 créditos por mês."}{" "}
            Você revisa antes de salvar. O conteúdo será enviado ao serviço de IA para extração.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={extract} disabled={busy || (!text.trim() && !attachment)}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              Identificar atividades
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setNoticeId(null);
                setWarnings([]);
                setAppliedProfileIds([]);
                setSourceProfileIds([]);
                setShareOriginal(false);
                setPublicationReference(null);
                resetDecisions();
                setDrafts([blankAction(profileId)]);
              }}
            >
              Cadastrar manualmente
            </Button>
          </div>
        </section>
      ) : (
        <section key="review-actions" className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Confira antes de salvar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirme a criança, os detalhes e cada prazo. Datas vazias ficam como “a confirmar”.
              Datas que você alterar serão identificadas como planejamento da família.
            </p>
          </div>
          {warnings.length ? (
            <ul className="list-disc space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 pl-8 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {appliedProfileIds.length ? (
            <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
              Este recado já foi aplicado a{" "}
              {profiles
                .filter((p) => appliedProfileIds.includes(p.id))
                .map((p) => p.name)
                .join(", ")}
              . Você pode revisar para outro filho sem nova cobrança de importação. As atividades
              anteriores serão preservadas; para alterá-las, abra Atividades.
            </p>
          ) : null}
          {publicationReference ? (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">
                Publicação identificada: {publicationReference.date.split("-").reverse().join("/")}
              </p>
              <p className="mt-1 text-muted-foreground">{publicationReference.sourceExcerpt}</p>
              <p className="mt-2">Confira essa referência e as datas calculadas antes de salvar.</p>
            </div>
          ) : null}
          {noticeId ? (
            <fieldset className="space-y-3 rounded-xl border p-5">
              <legend className="px-1 text-sm font-semibold">
                Privacidade do recado e do anexo
              </legend>
              <p className="text-sm text-muted-foreground">
                As atividades seguem as permissões de cada criança. Para compartilhar o original,
                confirme todas as crianças mencionadas, mesmo sem atividades. Se houver dados de
                outra criança que não aparece aqui, mantenha o original privado.
              </p>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shareOriginal}
                  onChange={(e) => setShareOriginal(e.target.checked)}
                />
                Confirmo que o original contém informações apenas das crianças marcadas abaixo.
              </label>
              {shareOriginal ? (
                profiles.map((p) => {
                  const required = drafts.some((d) => d.value.profileId === p.id);
                  return (
                    <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={required || sourceProfileIds.includes(p.id)}
                        disabled={required}
                        onChange={(e) =>
                          setSourceProfileIds(
                            e.target.checked
                              ? [...sourceProfileIds, p.id]
                              : sourceProfileIds.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sem essa confirmação, um original novo fica restrito ao titular e a quem o enviou.
                  Um escopo já confirmado continua protegido.
                </p>
              )}
            </fieldset>
          ) : null}
          {drafts.map((draft, index) => (
            <article key={draft.key} className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Atividade {index + 1}</h3>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover atividade ${index + 1}`}
                  disabled={busy || (mode === "manual" && drafts.length === 1)}
                  onClick={() => void removeDraft(draft)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <ActionFields
                subjectOptions={subjectOptions}
                profileTurmas={profileTurmas}
                subjectHint={draft.subjectHint ?? null}
                prefix={draft.key}
                value={draft.value}
                onChange={(value) => {
                  setDrafts((current) =>
                    current.map((d) => (d.key === draft.key ? { ...d, value } : d)),
                  );
                  resetDecisions();
                }}
                profiles={profiles}
                adults={adults}
                isPro={
                  proProfileIds.includes(draft.value.profileId) ||
                  (ownerIsPro && !initialProfiles.some((p) => p.id === draft.value.profileId))
                }
              />
              {corrections.some((c) => c.index === index) ? (
                <label className="grid gap-2 rounded-lg border border-amber-500 p-4 text-sm">
                  <span className="font-medium">O prazo desta atividade mudou?</span>
                  <select
                    className="min-h-11 rounded-md border bg-background px-3"
                    aria-label={`Correção da atividade ${index + 1}`}
                    value={(() => {
                      const r = resolutions.find((r) => r.index === index);
                      return r?.kind === "replace" ? r.actionId : (r?.kind ?? "");
                    })()}
                    onChange={(e) => {
                      const selected = corrections.find(
                        (c) => c.index === index && c.id === e.target.value,
                      );
                      setResolutions([
                        ...resolutions.filter((r) => r.index !== index),
                        ...(selected
                          ? [
                              {
                                index,
                                kind: "replace" as const,
                                actionId: selected.id,
                                version: selected.version,
                              },
                            ]
                          : e.target.value === "separate"
                            ? [{ index, kind: "separate" as const }]
                            : []),
                      ]);
                    }}
                  >
                    <option value="">Selecione como tratar este recado</option>
                    <option value="separate">É outra atividade; manter as duas</option>
                    {corrections
                      .filter((c) => c.index === index)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          Corrigir: {c.title}, prazo{" "}
                          {c.dueAt?.split("-").reverse().join("/") ?? "a confirmar"}
                        </option>
                      ))}
                  </select>
                  <span className="text-muted-foreground">
                    Ao corrigir, a conclusão e o histórico são preservados. Confira os campos acima:
                    o lembrete anterior será substituído pelo escolhido nesta revisão.
                  </span>
                </label>
              ) : null}
            </article>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              setDrafts([...drafts, blankAction(profileId)]);
              resetDecisions();
            }}
            disabled={drafts.length >= 30}
          >
            <Plus className="mr-2 size-4" aria-hidden />
            Adicionar atividade
          </Button>
          {duplicates.length ? (
            <div className="space-y-3 rounded-lg border border-amber-500 p-4">
              <p className="font-medium">Itens semelhantes na agenda</p>
              {duplicates.map((d) => (
                <Link
                  key={d.id}
                  className="block text-sm text-primary-ink underline"
                  href={`/recados/acoes/${d.id}`}
                >
                  {d.title}, abrir para corrigir
                </Link>
              ))}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowDuplicates}
                  onChange={(e) => setAllowDuplicates(e.target.checked)}
                />
                São atividades diferentes; desejo salvar outra.
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={save}>
              {busy
                ? "Salvando…"
                : `Salvar ${drafts.length} atividade${drafts.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (mode === "manual") {
                  router.push("/atividades");
                  return;
                }
                resetToImport();
              }}
            >
              {mode === "manual" ? "Cancelar" : "Voltar à importação"}
            </Button>
            {mode === "capture" && noticeId && !noticeConfirmed ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setDiscardOpen(true)}
              >
                Descartar recado
              </Button>
            ) : null}
          </div>
          {mode === "capture" && noticeId && !noticeConfirmed ? (
            <>
              <p className="text-xs text-muted-foreground">
                Voltar à importação guarda este rascunho em “Falta conferir antes de salvar”, e
                retomar não consome outro crédito. Para não guardar, descarte o recado.
              </p>
              <DiscardNoticeDialog
                open={discardOpen}
                onOpenChange={setDiscardOpen}
                noticeId={noticeId}
                onDiscarded={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
              />
            </>
          ) : null}
        </section>
      )}
      {!drafts.length && warnings.length ? (
        <div role="status" className="space-y-2 rounded-lg border border-amber-500/40 p-4 text-sm">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {mode === "capture" ? (
        <p className="text-xs text-muted-foreground">
          Teams e Batista ID: copie a publicação e baixe o anexo no aplicativo da escola. Este fluxo
          não sincroniza automaticamente novas publicações. Anotações do aluno podem ser enviadas
          por foto.
        </p>
      ) : null}
    </div>
  );
}
