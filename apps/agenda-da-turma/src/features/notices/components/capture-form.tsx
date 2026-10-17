"use client";

import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import { cn } from "@informach/ui/lib/utils";
import { Camera, FileUp, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { handleAiHttpError } from "@/features/ai/_http-errors";
import { todayLocalIso } from "@/features/dashboard/date";
import {
  dayMonthLabel,
  formatClockTime,
  longDayLabel,
  shortDayLabel,
  weekdayLong,
} from "@/features/dashboard/day-labels";
import { createStudentProfileAction } from "@/features/students/actions";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import type { SubjectOptionsByProfile } from "@/features/subjects/options-service";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { catchActionResult } from "@/lib/action-result";
import { confirmNoticeAction, discardDraftActionAction } from "../actions";
import { draftFromExtractedAction } from "../draft-from-extraction";
import { readLastChild, rememberLastChild } from "../last-child";
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
 * `subjectHint` é a matéria como a leitura a reconheceu: a revisão mostra
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
/** De onde veio a data, curto, para a linha de resumo de cada atividade lida. */
const ORIGIN_SHORT: Record<NoticeActionInput["dateOrigin"], string> = {
  school: "a escola disse",
  relative: "contada a partir do recado",
  schedule: "na próxima aula",
  family: "planejado por vocês",
  unspecified: "a confirmar",
};

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/** "Clara", "Clara e Miguel", "Ana, Bia e Caio". */
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/** O que ficou salvo, para o painel de "Pronto" no lugar do redirecionamento. */
type SavedSummary = {
  count: number;
  profileIds: string[];
  firstDue: string | null;
  reminders: number;
  shared: number;
};

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
  resumeUnavailable = false,
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
   * Caminho escolhido na folha "O que chegou?". Decide o que vem primeiro e
   * recebe o foco; todos os caminhos usam o mesmo formulário e a mesma revisão.
   */
  captureMode?: "foto" | "colar" | "falar" | "compartilhado";
  defaultProfileId?: string;
  defaultType?: NoticeActionInput["type"];
  /** Dia escolhido no calendário: a atividade já nasce com ele. */
  defaultDueAt?: string;
  defaultSource?: z.infer<typeof noticeSourceSchema>;
  /** Texto já vindo do compartilhamento pela rota de segurança. */
  defaultText?: string;
  /**
   * O `?retomar=` não achou rascunho (foi salvo ou descartado). Mora aqui, e
   * não na página, para sumir quando esta tela acabou de salvar o mesmo
   * recado: depois do refresh a página não acha mais o rascunho, e o aviso
   * aparecia em cima do "Pronto".
   */
  resumeUnavailable?: boolean;
  /** Rascunho lido e ainda sem conferir (`?retomar=`), para continuar a revisão. */
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
  const [newChildName, setNewChildName] = useState("");
  // Quem entra por "Foto", ou por um compartilhamento do sistema, está, na
  // maioria das vezes, mandando a agenda ou o caderno; é o que o próprio texto
  // da tela diz. Deixar "Teams" aqui marcava como publicação da escola a letra
  // de uma criança, e com o compartilhamento automático isso iria para a turma
  // inteira. Quem tiver recebido o anexo da escola troca a origem em "Mais
  // opções".
  const initialSource =
    initialNotice?.source ??
    (captureMode === "foto" || captureMode === "compartilhado" ? "notebook" : defaultSource);
  const [source, setSource] = useState<z.infer<typeof noticeSourceSchema>>(initialSource);
  /**
   * Esta tela abriu retomando um rascunho (`?retomar=`). Guardado na montagem:
   * depois de salvar, o refresh tira `initialNotice`, mas a URL continua com o
   * parâmetro e "Trazer outro recado" precisa limpá-la.
   */
  const [resumed] = useState(Boolean(initialNotice));
  /**
   * Compartilhar com a turma nasce marcado quando faz sentido para ela: matéria
   * da turma, prazo da escola e Pro. Anotação de caderno nunca: ali é a letra
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
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
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
  /** A leitura em andamento: a tela troca o formulário pelo aviso de "lendo". */
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  // O botão de salvar some com a revisão; o foco vai para o "Pronto", que é o
  // que mudou na tela, em vez de cair no começo da página.
  const savedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (saved) savedHeading.current?.focus();
  }, [saved]);
  /** Atividades abertas ou fechadas à mão; as outras seguem `needsAttention`. */
  const [openDrafts, setOpenDrafts] = useState<Record<string, boolean>>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  /** Replay de um recado já confirmado: não há rascunho no servidor. */
  const [noticeConfirmed, setNoticeConfirmed] = useState(false);

  /**
   * Compartilhamento do sistema: o service worker guardou no aparelho e a
   * navegação chegou aqui. Buscar uma vez, e apagar: recado compartilhado não
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
  // O caminho escolhido na folha "O que chegou?" decide o que vem primeiro na
  // tela e leva o foco até ele: a câmera, o campo de colar ou o microfone.
  useEffect(() => {
    if (!captureMode) return;
    const targetId =
      captureMode === "foto"
        ? "notice-camera"
        : captureMode === "falar"
          ? "notice-voice"
          : "notice-text";
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }, [captureMode]);

  // Sem criança na URL e sem rascunho para retomar, começa pela última deste
  // aparelho. Depois da hidratação: `localStorage` não existe no servidor.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na montagem
  useEffect(() => {
    // No cadastro à mão a primeira atividade já nasceu para uma criança: trocar
    // a criança aqui deixaria a primeira para uma e as seguintes para outra.
    if (mode === "manual") return;
    if (initialNotice || initialProfiles.some((p) => p.id === defaultProfileId)) return;
    const last = readLastChild();
    if (last && initialProfiles.some((p) => p.id === last)) setProfileId(last);
  }, []);

  const profileName = (pid: string) => profiles.find((p) => p.id === pid)?.name ?? "";
  const childName = profileName(profileId);

  /**
   * Muda toda vez que a revisão acaba (salvou, voltou ao recado, descartou). O
   * "Desfazer" do aviso de Tirar só vale dentro da revisão em que nasceu: depois
   * de salvar, ele trazia a atividade de volta para uma revisão já fechada.
   */
  const reviewEpoch = useRef(0);
  function resetDecisions() {
    setCorrections([]);
    setResolutions([]);
    setDuplicates([]);
    setAllowDuplicates(false);
  }
  function resetToImport() {
    reviewEpoch.current += 1;
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
    // nesta tela (ou de um recado já salvo, revisado para outra criança)
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
        // a tela volta ao passo de importação, e aí a URL é limpa: a página
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
    const position = drafts.findIndex((d) => d.key === draft.key);
    const epoch = reviewEpoch.current;
    dropDraftLocally(draft.key);
    // Tirar chega ao servidor na hora (recarregar não traz de volta), então
    // desfazer devolve a atividade como escrita nesta tela: ela é salva junto
    // com as outras, e só se a pessoa salvar.
    toast("Atividade tirada do recado.", {
      action: {
        label: "Desfazer",
        onClick: () => {
          if (reviewEpoch.current !== epoch) return;
          setDrafts((current) => {
            if (current.some((d) => d.key === draft.key)) return current;
            const next = [...current];
            next.splice(Math.min(position, next.length), 0, { ...draft, actionId: undefined });
            return next;
          });
          resetDecisions();
        },
      },
    });
  }

  async function addChild() {
    setBusy(true);
    setError("");
    const result = await catchActionResult(() =>
      createStudentProfileAction({ name: newChildName.trim(), birthDate: null }),
    );
    setBusy(false);
    if (!result.ok) {
      setError("Não foi possível adicionar a criança. Confira o nome e o limite do seu plano.");
      return;
    }
    setProfiles([...profiles, { id: result.value.id, name: newChildName.trim() }]);
    setProfileId(result.value.id);
    if (mode === "manual") setDrafts([blankAction(result.value.id, defaultType)]);
    router.refresh();
  }
  /**
   * Transcreve o ditado e devolve o texto para o campo acima. A leitura do
   * recado continua sendo um passo separado, que a pessoa dispara depois de
   * conferir a transcrição: ditar errado não gasta a interpretação.
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
   * Sem isto, um PDF de quatro páginas não mostrava o seletor de páginas e era
   * recusado no envio, com um erro sobre o qual a pessoa não podia fazer nada.
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
    setReading(true);
    rememberLastChild(profileId);
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
        "A conexão foi interrompida. Envie o mesmo recado de novo para recuperar o resultado.",
      );
    } finally {
      setBusy(false);
      setReading(false);
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
      const issue = parsed.error.issues[0];
      const index = issue?.path[0] === "actions" ? issue.path[1] : undefined;
      const draft = typeof index === "number" ? drafts[index] : undefined;
      // O campo com problema pode estar num cartão fechado: abrir é o mínimo
      // para a pessoa conseguir corrigir o que o aviso diz.
      if (draft) setOpenDrafts((current) => ({ ...current, [draft.key]: true }));
      const message = issue?.message ?? "Confira os campos.";
      setError(typeof index === "number" ? `Atividade ${index + 1}: ${message}` : message);
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
    if (mode === "manual") {
      router.push(
        savedProfileIds.length === 1 ? `/atividades?perfil=${savedProfileIds[0]}` : "/atividades",
      );
      router.refresh();
      return;
    }
    // Trazer um recado termina aqui, com o que entrou na semana, e não numa
    // lista: a próxima pergunta é "e agora?", ver na semana ou trazer outro.
    rememberLastChild(profileId);
    const dates = parsed.data.actions
      .map((item) => item.dueAt)
      .filter((date): date is string => Boolean(date))
      .sort();
    setSaved({
      count: parsed.data.actions.length,
      profileIds: savedProfileIds,
      firstDue: dates[0] ?? null,
      // Só os que ainda vão chegar: um lembrete que já passou não "chega no
      // horário marcado".
      reminders: parsed.data.actions.filter(
        (item) => item.reminderAt && new Date(item.reminderAt).valueOf() > Date.now(),
      ).length,
      shared: parsed.data.actions.filter((item) => item.shareWithTurma).length,
    });
    resetToImport();
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  /** "Trazer outro recado": o formulário limpo, para a mesma criança. */
  function startOver() {
    setSaved(null);
    setText("");
    setAttachment(null);
    setPhotos([]);
    setPageCount(0);
    setPages([]);
    setPublishedAt("");
    setSourceUrl("");
    setError("");
    setOpenDrafts({});
    setSource(initialSource);
    if (resumed) router.replace("/recados/novo");
  }

  const todayIso = todayLocalIso();
  const primary = captureMode ?? "generic";
  const inReview =
    !saved && profiles.length > 0 && !whatsAppMessages && !reading && drafts.length > 0;
  const errorBox = (
    <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive-ink">
      {error}
    </p>
  );
  const formTitle =
    primary === "foto"
      ? `Foto para ${childName}`
      : primary === "colar"
        ? `Mensagem para ${childName}`
        : primary === "falar"
          ? `Falar o recado de ${childName}`
          : `Recado para ${childName}`;
  const textIsPrimary = primary !== "foto";
  const draftNames = joinNames(
    [...new Set(drafts.map((d) => d.value.profileId))].map(profileName).filter(Boolean),
  );
  // A privacidade do original fala de quem o recado menciona: as crianças das
  // atividades, mais as que a pessoa marcar.
  const requiredSourceIds = [...new Set(drafts.map((d) => d.value.profileId))];
  const sourceNames = joinNames(
    [...new Set([...requiredSourceIds, ...sourceProfileIds])].map(profileName).filter(Boolean),
  );
  const subjectFor = (value: NoticeActionInput) =>
    (subjectOptions[value.profileId] ?? []).find(
      (option) => option.id === (value.subjectId ?? value.profileSubjectId),
    );
  // Fechada quando a leitura já respondeu tudo; aberta quando falta algo que
  // só a pessoa sabe, ou quando é ela quem está escrevendo.
  //
  // "Mandar para a turma" nasce marcado em algumas atividades, e a regra é que
  // a caixa fique à vista na revisão: um cartão fechado mandaria para a turma
  // inteira sem ninguém ver. Lembrete que já passou também abre, com o aviso.
  const needsAttention = (draft: Draft, index: number) =>
    !noticeId ||
    !draft.value.title.trim() ||
    Boolean(draft.subjectHint && !subjectFor(draft.value)) ||
    draft.value.shareWithTurma ||
    Boolean(draft.value.reminderAt && new Date(draft.value.reminderAt).valueOf() < Date.now()) ||
    corrections.some((c) => c.index === index);
  const isOpen = (draft: Draft, index: number) =>
    openDrafts[draft.key] ?? needsAttention(draft, index);

  const fileButton = (
    <label
      htmlFor="notice-file"
      className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-foreground/15 bg-background px-4 text-[15px] font-bold focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
    >
      <FileUp className="size-5" aria-hidden /> Escolher arquivo
      <input
        id="notice-file"
        className="sr-only"
        type="file"
        // A conversa exportada do WhatsApp (.txt) vira texto para conferir. Na
        // Foto o texto mora em "Mais opções", fechado: ali ela sumiria.
        accept={
          primary === "foto"
            ? "image/png,image/jpeg,image/webp,application/pdf"
            : "image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt"
        }
        disabled={busy}
        onChange={(e) => {
          void chooseFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
  const cameraButton = (
    <label
      htmlFor="notice-camera"
      className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[15px] font-bold text-primary-foreground shadow-solid-primary focus-within:ring-2 focus-within:ring-ring"
    >
      <Camera className="size-5" aria-hidden /> Tirar foto
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
  );
  const textField = (
    <label htmlFor="notice-text" className="grid gap-2 text-sm font-semibold">
      {primary === "foto" || source === "notebook"
        ? "Observação para acompanhar a foto (opcional)"
        : primary === "falar"
          ? "O que você falou"
          : "Cole a mensagem ou publicação"}
      <textarea
        id="notice-text"
        className={cn(
          "rounded-xl border border-input bg-background p-3 text-[15px] font-normal",
          textIsPrimary ? "min-h-40" : "min-h-24",
        )}
        placeholder={
          primary === "falar"
            ? "O texto do que você falar aparece aqui, para conferir."
            : "Ex.: O passeio será na sexta-feira. Entreguem a autorização até quarta."
        }
        value={text}
        maxLength={NOTICE_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
      />
      {/* Cortar em silêncio seria pior: a pessoa mandaria ler metade de um
          recado achando que mandou o todo. */}
      {textWasTrimmed ? (
        <p role="status" className="text-sm font-normal text-muted-foreground">
          O recado é maior do que cabe numa leitura e foi cortado no começo dele. Confira o que
          ficou e apague o que não for necessário.
        </p>
      ) : null}
    </label>
  );
  /*
    Ditar escreve no mesmo campo de texto, e não num fluxo paralelo: a
    transcrição fica visível para conferência antes de gastar a leitura do
    recado.
  */
  const voiceField = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-foreground/15 p-3",
        primary === "falar" && "p-4",
      )}
    >
      {/* `SpeechInput` é um botão só de ícone: o rótulo visível vive ao lado, e o
          acessível vem do aria-label. */}
      <SpeechInput
        id="notice-voice"
        type="button"
        variant={primary === "falar" ? "default" : "outline"}
        aria-label="Ditar a atividade"
        className={cn("shrink-0 rounded-full", primary === "falar" ? "size-16" : "size-11")}
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
        <span className="font-bold">
          {primary === "falar" ? "Toque e conte o que precisa ser feito." : "Ditar a atividade."}
        </span>{" "}
        <span className="text-muted-foreground">
          O texto aparece {primary === "falar" ? "abaixo" : "no campo"} para você conferir antes de
          mandar ler.
        </span>
      </p>
    </div>
  );

  return (
    <div className="space-y-5">
      {resumeUnavailable && !saved ? (
        <p role="status" className="rounded-2xl bg-muted p-4 text-sm">
          Aquele recado não está mais esperando conferência: ele foi salvo ou descartado. Dá para
          mandar um recado novo aqui.
        </p>
      ) : null}
      {saved ? (
        <section
          role="status"
          aria-labelledby="capture-saved-title"
          className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-5"
        >
          <h2
            id="capture-saved-title"
            ref={savedHeading}
            tabIndex={-1}
            className="text-2xl font-extrabold tracking-tight outline-none"
          >
            Pronto. {saved.count === 1 ? "1 atividade está" : `${saved.count} atividades estão`}{" "}
            {saved.firstDue ? "na semana" : "na Agenda"} de{" "}
            {joinNames(saved.profileIds.map(profileName).filter(Boolean))}.
          </h2>
          <p className="text-[15px] text-muted-foreground">
            {saved.firstDue
              ? `${saved.count === 1 ? "Ela é para" : "A primeira é para"} ${weekdayLong(saved.firstDue).toLowerCase()}, ${dayMonthLabel(saved.firstDue, todayIso)}.`
              : "Sem data por enquanto: fica em Para hoje até alguém marcar o dia."}
            {saved.reminders ? " Os lembretes chegam no horário marcado." : ""}
            {saved.shared
              ? saved.shared === 1
                ? " Uma foi para a turma."
                : ` ${saved.shared} foram para a turma.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11 rounded-xl font-bold">
              <Link
                href={`/calendario?view=week${saved.firstDue ? `&date=${saved.firstDue}` : ""}${saved.profileIds.length === 1 ? `&perfil=${saved.profileIds[0]}` : ""}`}
              >
                Ver na semana
              </Link>
            </Button>
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={startOver}>
              Trazer outro recado
            </Button>
            <Button asChild variant="ghost" className="min-h-11 rounded-xl">
              <Link
                href={
                  saved.profileIds.length === 1
                    ? `/atividades?perfil=${saved.profileIds[0]}`
                    : "/atividades"
                }
              >
                Ver as atividades
              </Link>
            </Button>
          </div>
        </section>
      ) : !profiles.length ? (
        <section
          key="create-profile"
          className="space-y-4 rounded-[20px] border border-foreground/15 bg-background p-5"
        >
          <h2 className="text-xl font-extrabold tracking-tight">Como se chama a criança?</h2>
          <p className="text-sm text-muted-foreground">
            Só o nome basta. Escola, turma e horário podem vir depois.
          </p>
          <label htmlFor="child-name" className="grid gap-2 text-sm font-semibold">
            Nome
            <Input
              id="child-name"
              value={newChildName}
              maxLength={80}
              onChange={(e) => setNewChildName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            onClick={addChild}
            disabled={busy || newChildName.trim().length < 2}
            className="min-h-11 rounded-xl font-bold"
          >
            Adicionar criança
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
            // prazo de hoje. `setText` corta no teto: dez mensagens longas
            // passam de 16 000 caracteres com facilidade.
            setText(buildNoticeTextFromMessages(picked));
            // Só quando as mensagens escolhidas trazem data: apagar o que a
            // pessoa digitou à mão seria perder a referência de publicação.
            const latest = latestMessageDate(picked);
            if (latest) setPublishedAt(latest);
            setWhatsAppMessages(null);
          }}
        />
      ) : reading ? (
        <section
          role="status"
          aria-live="polite"
          className="flex items-start gap-4 rounded-[20px] border border-foreground/15 bg-background p-5"
        >
          <Loader2 className="mt-1 size-6 shrink-0 animate-spin" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight">Lendo o recado de {childName}</h2>
            <p className="text-[15px] text-muted-foreground">
              A Agenda separa uma atividade por matéria e por prazo. Se a escola não deu data, fica
              a confirmar.
            </p>
          </div>
        </section>
      ) : !drafts.length ? (
        <section
          key="capture-notice"
          aria-labelledby="capture-title"
          className="space-y-5 rounded-[20px] border border-foreground/15 bg-background p-4 sm:p-6"
        >
          <h2 id="capture-title" className="text-xl font-extrabold tracking-tight">
            {formTitle}
          </h2>
          {profiles.length > 1 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-muted-foreground">
                Para qual criança?
              </legend>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p) => {
                  const on = p.id === profileId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setProfileId(p.id)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-bold",
                        on
                          ? "bg-foreground text-background"
                          : "border border-foreground/15 bg-background hover:bg-muted",
                      )}
                    >
                      <StudentAvatar name={p.name} size="pill" className="border" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {primary === "foto" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {cameraButton}
              {fileButton}
            </div>
          ) : null}
          {primary === "falar" ? voiceField : null}
          {textIsPrimary ? textField : null}
          {primary === "colar" ? (
            <div className="space-y-2">
              {fileButton}
              <p className="text-sm text-muted-foreground">
                Print, PDF ou a conversa exportada do WhatsApp (.txt), sem mídia: você escolhe as
                mensagens.
              </p>
            </div>
          ) : null}
          {primary === "generic" || primary === "compartilhado" ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {cameraButton}
                {fileButton}
              </div>
              {voiceField}
            </div>
          ) : null}

          {attachment ? (
            <div className="space-y-3 rounded-2xl border border-foreground/15 p-3">
              <p className="break-words text-sm font-semibold">
                {photos.length > 1
                  ? `${photos.length} páginas, de até ${MAX_PHOTOS}, num PDF só`
                  : attachment.dataUrl.startsWith("data:image/")
                    ? `Página 1 de até ${MAX_PHOTOS}`
                    : `Arquivo: ${attachment.name}`}
              </p>
              {attachment.dataUrl.startsWith("data:image/") ? (
                <Image
                  src={attachment.dataUrl}
                  alt="Foto selecionada para leitura"
                  width={800}
                  height={600}
                  unoptimized
                  className="max-h-72 w-full rounded-xl object-contain"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                {photos.length || attachment.dataUrl.startsWith("data:image/") ? (
                  <label
                    htmlFor="notice-more-photos"
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-foreground/15 px-4 text-sm font-bold focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
                  >
                    <Plus className="size-4" aria-hidden />
                    Outra página
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
                <Button
                  variant="ghost"
                  className="min-h-11 rounded-xl"
                  disabled={busy}
                  onClick={() => {
                    setAttachment(null);
                    setPhotos([]);
                    setPageCount(0);
                    setPages([]);
                  }}
                >
                  {attachment.dataUrl.startsWith("data:image/") || photos.length
                    ? "Tirar de novo"
                    : "Trocar arquivo"}
                </Button>
              </div>
            </div>
          ) : primary === "foto" ? (
            <p className="text-sm text-muted-foreground">
              Fotografe a página inteira, com boa luz e sem cortar as anotações. Agenda de duas
              páginas vira um recado só: tire a primeira e toque em Outra página.
            </p>
          ) : null}

          {pageCount > 0 && !photos.length ? (
            <fieldset className="space-y-3 rounded-2xl border border-foreground/15 p-4">
              <legend className="px-1 text-sm font-semibold">
                PDF com {pageCount} páginas. Escolha até 3
              </legend>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
                  <label
                    key={page}
                    className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"
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

          {/* O que quase ninguém precisa mexer fica a um toque, e não entre a
              pessoa e o botão de ler. */}
          <details className="group rounded-2xl border border-foreground/15">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
              <span>
                Mais opções{" "}
                <span className="font-normal text-muted-foreground">
                  ({primary === "foto" ? "observação, " : ""}de onde veio, data e link)
                </span>
              </span>
              <span className="text-primary-ink group-open:hidden">Abrir</span>
              <span className="hidden text-primary-ink group-open:inline">Fechar</span>
            </summary>
            <div className="grid gap-4 border-t border-foreground/15 p-4">
              {textIsPrimary ? null : textField}
              <label htmlFor="notice-source" className="grid gap-2 text-sm font-semibold">
                De onde veio o recado?
                <select
                  id="notice-source"
                  className="h-11 rounded-xl border bg-background px-3 font-normal"
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
              <label htmlFor="notice-published" className="grid gap-2 text-sm font-semibold">
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
                  A data em que o recado foi escrito ajuda a entender “amanhã”. A data da foto nunca
                  vira prazo.
                </span>
              </label>
              <label htmlFor="notice-url" className="grid gap-2 text-sm font-semibold">
                Link do original (opcional)
                <Input
                  id="notice-url"
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                />
                <span className="font-normal text-muted-foreground">
                  Pode exigir acesso à conta da escola. A Agenda não busca mensagens sozinha: do
                  Teams ou do Batista ID, copie a publicação e baixe o anexo no aplicativo.
                </span>
              </label>
            </div>
          </details>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isPro
                ? "Usa 1 leitura, mesmo que vire várias atividades. Ditado usa 2."
                : "Os primeiros recados são por nossa conta. Depois, o Pro lê 70 por mês."}{" "}
              Nada é salvo antes de você conferir. Para ler, o conteúdo passa por um serviço de
              inteligência artificial.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={extract}
                disabled={busy || (!text.trim() && !attachment)}
                className="min-h-12 rounded-xl px-6 text-base font-extrabold"
              >
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                Ler o recado
              </Button>
              <Button
                variant="ghost"
                className="min-h-12 rounded-xl"
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
                Escrever à mão
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section key="review-actions" aria-labelledby="review-title" className="space-y-4">
          {mode === "manual" ? null : (
            <div>
              <h2 id="review-title" className="text-2xl font-extrabold tracking-tight">
                {noticeId
                  ? `A Agenda achou ${drafts.length === 1 ? "1 atividade" : `${drafts.length} atividades`} para ${draftNames}`
                  : drafts.length === 1
                    ? "Escreva a atividade"
                    : "Escreva as atividades"}
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                {noticeId
                  ? "Confira as datas. O que a escola não disse fica a confirmar."
                  : "Sem leitura: fica como você escrever."}
              </p>
            </div>
          )}
          {warnings.length ? (
            <ul className="list-disc space-y-1 rounded-2xl bg-chart-4/10 p-4 pl-8 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {appliedProfileIds.length ? (
            <p role="status" className="rounded-2xl bg-muted p-4 text-sm">
              Este recado já foi lido para{" "}
              {joinNames(
                profiles.filter((p) => appliedProfileIds.includes(p.id)).map((p) => p.name),
              )}
              . Revisar para outra criança não gasta outra leitura. As atividades de antes
              continuam; para mudar alguma, abra Atividades.
            </p>
          ) : null}
          {publicationReference ? (
            <div className="rounded-2xl border border-foreground/15 p-4 text-sm">
              <p className="font-bold">
                O recado é de {longDayLabel(publicationReference.date, todayIso).toLowerCase()}.
              </p>
              <p className="mt-1 text-muted-foreground">{publicationReference.sourceExcerpt}</p>
              <p className="mt-2">
                “Amanhã” e “semana que vem” foram contados a partir desse dia. Confira antes de
                salvar.
              </p>
            </div>
          ) : null}

          {drafts.map((draft, index) => {
            const subject = subjectFor(draft.value);
            const open = isOpen(draft, index);
            const regionId = `${draft.key}-details`;
            const due = draft.value.dueAt
              ? `${shortDayLabel(draft.value.dueAt, todayIso)}${draft.value.time ? ` · ${formatClockTime(draft.value.time)}` : ""}`
              : "Sem data";
            return (
              <article
                key={draft.key}
                className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
              >
                <div className="flex items-start gap-3 p-4">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-2 size-2.5 shrink-0 rounded-full",
                      subject
                        ? (DOT_CLASS[subject.colorIndex] ?? "bg-foreground/70")
                        : "border-[1.5px] border-dashed border-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                      Atividade {index + 1}
                    </h3>
                    <p className="break-words text-base font-bold leading-snug">
                      {draft.value.title.trim() || "Sem título ainda"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        ACTIVITY_TYPE_LABELS[draft.value.type],
                        subject?.name ?? "Sem matéria",
                        draft.value.dueAt
                          ? `${due}, ${ORIGIN_SHORT[draft.value.dateOrigin]}`
                          : "Sem data, a confirmar",
                        draft.value.shareWithTurma ? "vai para a turma" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {draft.subjectHint && !subject ? (
                      <p className="text-sm font-semibold text-chart-4-ink">
                        {draft.subjectHint} não está nas matérias de{" "}
                        {profileName(draft.value.profileId)}.
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-11 min-w-16 shrink-0 rounded-xl font-bold"
                    aria-label={`Tirar a atividade ${index + 1}`}
                    disabled={busy || (mode === "manual" && drafts.length === 1)}
                    onClick={() => void removeDraft(draft)}
                  >
                    Tirar
                  </Button>
                </div>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={regionId}
                  aria-label={`${open ? "Fechar os detalhes" : "Ver e mudar os detalhes"} da atividade ${index + 1}`}
                  onClick={() => setOpenDrafts((current) => ({ ...current, [draft.key]: !open }))}
                  className="flex min-h-11 w-full items-center border-t border-foreground/15 px-4 text-left text-sm font-bold text-primary-ink hover:bg-muted/60"
                >
                  {open ? "Fechar os detalhes" : "Ver e mudar os detalhes"}
                </button>
                <div id={regionId} hidden={!open} className="border-t border-foreground/15 p-4">
                  <ActionFields
                    subjectOptions={subjectOptions}
                    profileTurmas={profileTurmas}
                    subjectHint={draft.subjectHint ?? null}
                    fromNotice={Boolean(noticeId) && Boolean(draft.actionId)}
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
                </div>
                {corrections.some((c) => c.index === index) ? (
                  <label className="mx-4 mb-4 grid min-w-0 gap-2 rounded-2xl bg-chart-4/10 p-4 text-sm">
                    <span className="font-bold">O prazo desta atividade mudou?</span>
                    <select
                      className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3"
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
                      <option value="">Escolha o que fazer com este recado</option>
                      <option value="separate">É outra atividade; manter as duas</option>
                      {corrections
                        .filter((c) => c.index === index)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Corrigir: {c.title}, para{" "}
                            {c.dueAt ? shortDayLabel(c.dueAt, todayIso) : "a confirmar"}
                          </option>
                        ))}
                    </select>
                    <span className="text-muted-foreground">
                      Ao corrigir, o que já foi feito e o histórico continuam. O lembrete de antes é
                      trocado pelo desta revisão.
                    </span>
                  </label>
                ) : null}
              </article>
            );
          })}

          {noticeId ? (
            <div className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-4">
              <div className="flex items-start gap-3">
                <input
                  id="share-original"
                  type="checkbox"
                  role="switch"
                  aria-checked={shareOriginal}
                  className="mt-1 size-5 shrink-0 accent-primary"
                  checked={shareOriginal}
                  onChange={(e) => setShareOriginal(e.target.checked)}
                />
                <label htmlFor="share-original" className="grid gap-0.5 text-sm">
                  <span className="text-[15px] font-bold">O recado fala só de {sourceNames}</span>
                  <span className="text-muted-foreground">
                    Ligado, quem acompanha {sourceNames} também vê o original. Se ele falar de outra
                    criança, deixe desligado: aí o original fica só com quem mandou e com quem
                    assina a Agenda.
                  </span>
                </label>
              </div>
              {shareOriginal && profiles.some((p) => !requiredSourceIds.includes(p.id)) ? (
                <fieldset className="space-y-1 border-t border-foreground/15 pt-3">
                  <legend className="text-sm font-semibold">
                    O recado também fala de outra criança daqui?
                  </legend>
                  {profiles
                    .filter((p) => !requiredSourceIds.includes(p.id))
                    .map((p) => (
                      <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sourceProfileIds.includes(p.id)}
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
                    ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}

          <Button
            variant="outline"
            className="min-h-11 rounded-xl"
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
            <div className="space-y-3 rounded-2xl bg-chart-4/10 p-4">
              <p className="font-bold">Parecido com o que já está na agenda</p>
              {duplicates.map((d) => (
                <Link
                  key={d.id}
                  className="block text-sm font-semibold text-primary-ink underline"
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
                São atividades diferentes; salvar mesmo assim.
              </label>
            </div>
          ) : null}
          {/* Na revisão o erro fica junto do botão que o causou, e não no fim
              da página, depois do aviso de "voltar guarda o recado". */}
          {error ? errorBox : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={save}
              className="min-h-12 rounded-xl px-6 text-base font-extrabold"
            >
              {busy
                ? "Salvando…"
                : `Salvar ${drafts.length} atividade${drafts.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              variant="ghost"
              className="min-h-12 rounded-xl"
              disabled={busy}
              onClick={() => {
                if (mode === "manual") {
                  router.push("/atividades");
                  return;
                }
                resetToImport();
              }}
            >
              {mode === "manual" ? "Cancelar" : "Voltar ao recado"}
            </Button>
            {mode === "capture" && noticeId && !noticeConfirmed ? (
              <Button
                variant="ghost"
                className="min-h-12 rounded-xl text-destructive-ink hover:text-destructive-ink"
                disabled={busy}
                onClick={() => setDiscardOpen(true)}
              >
                Descartar recado
              </Button>
            ) : null}
          </div>
          {mode === "capture" && noticeId && !noticeConfirmed ? (
            <>
              <p className="text-sm text-muted-foreground">
                Voltar guarda o recado em Hoje, como “ficou sem conferir”, e continuar depois não
                gasta outra leitura. Para não guardar, descarte o recado.
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
      {!drafts.length && !reading && !saved && warnings.length ? (
        <div role="status" className="space-y-2 rounded-2xl bg-chart-4/10 p-4 text-sm">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {error && !inReview ? errorBox : null}
    </div>
  );
}
