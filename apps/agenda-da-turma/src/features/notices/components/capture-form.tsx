"use client";

import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import { cn } from "@informach/ui/lib/utils";
import { Camera, Check, FileUp, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { handleAiHttpError } from "@/features/ai/_http-errors";
import { todayLocalIso } from "@/features/dashboard/date";
import { formatClockTime, longDayLabel, shortDayLabel } from "@/features/dashboard/day-labels";
import { createStudentProfileAction } from "@/features/students/actions";
import type { SubjectOptionsByProfile } from "@/features/subjects/options-service";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { catchActionResult } from "@/lib/action-result";
import {
  confirmNoticeAction,
  discardDraftActionAction,
  shareSavedWithTurmaAction,
} from "../actions";
import { draftFromExtractedAction } from "../draft-from-extraction";
import { readLastChild, rememberLastChild } from "../last-child";
import { noticeErrorMessage } from "../messages";
import { takeHandedPhoto } from "../photo-handoff";
import { buildPdfFromPhotos, MAX_PHOTOS, type Photo } from "../photo-pdf";
import {
  countedNoun,
  firstDueSentence,
  pluralNoun,
  remindersSentence,
  singularNoun,
} from "../review-words";
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
  /** Os tipos do que entrou, para dizer "4 provas" e não "4 atividades". */
  types: string[];
  profileIds: string[];
  firstDue: string | null;
  /** A frase dos lembretes ("Os lembretes chegam dois dias antes…"), ou vazia. */
  reminders: string;
  /** O que acabou de entrar e pode ir para a turma: a pergunta do "Pronto". */
  shareIds: string[];
  shareTypes: string[];
  /** "3º B" quando tudo é de uma turma só. */
  turma: string | null;
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
  viewerId = "",
  viewerIsOwner = true,
  ownProfileIds,
  turmaLabels = {},
}: {
  /** Quem está trazendo o recado, para a frase de quem mais vê o original. */
  viewerId?: string;
  /** Quem está aqui é o titular: o original "fica só com você". */
  viewerIsOwner?: boolean;
  /**
   * As crianças da própria conta de quem traz o recado. Quem é titular de uma
   * casa e convidado de outra lê a frase certa para a criança escolhida.
   */
  ownProfileIds?: readonly string[];
  /** "3º B" por criança, para a pergunta "Mandar para a turma do 3º B?". */
  turmaLabels?: Record<string, string>;
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
  /** A criança é de uma casa Pro? (Perfil convidado herda o plano do titular.) */
  const isProForProfile = (pid: string) =>
    proProfileIds.includes(pid) || (ownerIsPro && !initialProfiles.some((p) => p.id === pid));
  /*
   * Mandar para a turma não nasce marcado na revisão (`defaultShare: false`
   * abaixo): como no canvas, a
   * pergunta vem uma vez, no "Pronto" ("Mandar para a turma do 3º B?"), para
   * o que pode ir (matéria da turma, prazo da escola, casa Pro). Uma caixa
   * marcada por padrão abria cada linha da revisão para ela ficar à vista.
   */
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
              defaultShare: false,
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
  // "O recado fala só de Clara" nasce desmarcado: o original pode falar de
  // outras crianças, e mostrá-lo aos outros adultos da casa é escolha de quem
  // trouxe o recado (regra da fase 3, mantida sobre o desenho do canvas).
  const [shareOriginal, setShareOriginal] = useState(false);
  /** A pergunta da turma no "Pronto": perguntar, mandando, mandado ou "agora não". */
  const [shareStep, setShareStep] = useState<"ask" | "sending" | "done" | "skipped">("ask");
  /** Quantas foram de fato para a turma, pela resposta do servidor. */
  const [sharedCount, setSharedCount] = useState(0);
  /**
   * Para quem é o recado só aparece como escolha quando a folha não disse: o
   * canvas chega em "Foto para Clara" com a criança já escolhida.
   */
  const [askChild] = useState(
    () => !initialNotice && !initialProfiles.some((p) => p.id === defaultProfileId),
  );
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
  // A foto tirada na própria folha "O que chegou?" (ver `photo-handoff.ts`).
  // Com ela na tela, o foco não vai para a câmera: a foto já está ali.
  const photoHanded = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na montagem
  useEffect(() => {
    if (captureMode !== "foto") return;
    const handed = takeHandedPhoto();
    if (!handed) return;
    photoHanded.current = true;
    setSource("notebook");
    void chooseFile(handed);
  }, []);
  // O caminho escolhido na folha "O que chegou?" decide o que vem primeiro na
  // tela e leva o foco até ele: a câmera, o campo de colar ou o microfone.
  useEffect(() => {
    if (!captureMode || photoHanded.current) return;
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
            defaultShare: false,
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
    // O que pode ir para a turma, entre o que acabou de entrar: matéria da
    // turma, prazo que a escola deu e casa Pro. A gravação confere de novo.
    const shareable = result.value.ids
      .map((id, position) => ({
        id,
        action: parsed.data.actions[result.value.indices[position] ?? -1],
      }))
      .filter((item): item is { id: string; action: NoticeActionInput } =>
        Boolean(
          item.action &&
            !item.action.shareWithTurma &&
            item.action.subjectId &&
            item.action.dueAt &&
            (item.action.dateOrigin === "school" || item.action.dateOrigin === "relative") &&
            profileTurmas[item.action.profileId] &&
            isProForProfile(item.action.profileId),
        ),
      );
    const turmas = [...new Set(shareable.map((item) => turmaLabels[item.action.profileId] ?? ""))];
    setShareStep("ask");
    setSaved({
      count: parsed.data.actions.length,
      types: parsed.data.actions.map((item) => item.type),
      profileIds: savedProfileIds,
      firstDue: dates[0] ?? null,
      // Só os que ainda vão chegar: um lembrete que já passou não chega.
      reminders: remindersSentence(parsed.data.actions),
      shareIds: shareable.map((item) => item.id),
      shareTypes: shareable.map((item) => item.action.type),
      turma: turmas.length === 1 && turmas[0] ? turmas[0] : null,
    });
    resetToImport();
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  /** "Mandar para a turma", no "Pronto": a mesma gravação da edição, uma por atividade. */
  async function shareSaved() {
    if (!saved?.shareIds.length) return;
    setShareStep("sending");
    const result = await catchActionResult(() =>
      shareSavedWithTurmaAction({ ids: saved.shareIds }),
    );
    if (!result.ok) {
      setShareStep("ask");
      toast.error(noticeErrorMessage(result.error.code));
      return;
    }
    setSharedCount(result.value.shared);
    setShareStep("done");
    if (result.value.skipped)
      toast(
        result.value.skipped === 1
          ? "Uma não pôde ir para a turma. Ela continua na agenda de vocês."
          : `${result.value.skipped} não puderam ir para a turma. Elas continuam na agenda de vocês.`,
      );
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
  const importStep =
    !saved && profiles.length > 0 && !whatsAppMessages && !reading && drafts.length === 0;
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
  // "Mandar para a turma" nasce desmarcado (a pergunta vem no "Pronto"), mas se
  // a pessoa marcar a caixa, o cartão fica aberto: fechado, mandaria para a
  // turma inteira sem ninguém ver. Lembrete que já passou também abre, com o aviso.
  const needsAttention = (draft: Draft, index: number) =>
    !noticeId ||
    !draft.value.title.trim() ||
    Boolean(draft.subjectHint && !subjectFor(draft.value)) ||
    draft.value.shareWithTurma ||
    Boolean(draft.value.reminderAt && new Date(draft.value.reminderAt).valueOf() < Date.now()) ||
    corrections.some((c) => c.index === index);
  const isOpen = (draft: Draft, index: number) =>
    openDrafts[draft.key] ?? needsAttention(draft, index);

  const isImage = Boolean(attachment?.dataUrl.startsWith("data:image/"));
  const shownPhoto = photos.at(-1)?.dataUrl ?? (isImage ? attachment?.dataUrl : null) ?? null;
  const pageNumber = photos.length || (attachment ? 1 : 0);
  const dictation = primary === "falar";

  const photoInput = (id: string, onFile: (file: File | undefined) => void, disabled = busy) => (
    <input
      id={id}
      className="sr-only"
      type="file"
      capture="environment"
      accept="image/jpeg,image/png,image/webp"
      disabled={disabled}
      onChange={(e) => {
        onFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const fileButton = (
    <label
      htmlFor="notice-file"
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-bold focus-within:ring-2 focus-within:ring-ring",
        primary === "foto"
          ? "border-background/40 text-background hover:bg-background/10"
          : "border-foreground/15 bg-background hover:bg-muted",
      )}
    >
      <FileUp className="size-[18px]" aria-hidden /> Escolher arquivo
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
      className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground shadow-solid-primary focus-within:ring-2 focus-within:ring-ring"
    >
      <Camera className="size-5" aria-hidden /> Tirar foto
      {photoInput("notice-camera", (file) => {
        setSource("notebook");
        void chooseFile(file);
      })}
    </label>
  );
  const textField = (
    <label htmlFor="notice-text" className="grid gap-2 text-sm font-semibold">
      {primary === "foto" || source === "notebook"
        ? "Observação para acompanhar a foto (opcional)"
        : dictation
          ? "O que você falou"
          : "Cole a mensagem ou publicação"}
      <textarea
        id="notice-text"
        className={cn(
          "rounded-xl border border-input bg-background p-3 text-[15px] font-normal",
          textIsPrimary ? "min-h-40" : "min-h-24",
        )}
        placeholder={
          dictation
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
        "flex items-center gap-3 rounded-2xl border border-foreground/15 bg-background p-3",
        dictation && "p-4",
      )}
    >
      {/* `SpeechInput` é um botão só de ícone: o rótulo visível vive ao lado, e o
          acessível vem do aria-label. */}
      <SpeechInput
        id="notice-voice"
        type="button"
        variant={dictation ? "default" : "outline"}
        aria-label="Ditar a atividade"
        className={cn("shrink-0 rounded-full", dictation ? "size-16" : "size-11")}
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
          {dictation ? "Toque e conte o que precisa ser feito." : "Ditar a atividade."}
        </span>{" "}
        <span className="text-muted-foreground">
          O texto aparece {dictation ? "abaixo" : "no campo"} para você conferir antes de mandar
          ler.
        </span>
      </p>
    </div>
  );
  /** As pílulas de criança, só quando a folha não disse para quem é. */
  const childPills =
    askChild && profiles.length > 1 ? (
      <fieldset className="flex flex-wrap items-center gap-2 pb-3">
        <legend className="sr-only">Para qual criança</legend>
        <span aria-hidden className="mr-0.5 text-sm font-semibold text-muted-foreground">
          Para
        </span>
        {profiles.map((p) => {
          const on = p.id === profileId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => setProfileId(p.id)}
              className={cn(
                "inline-flex min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] items-center rounded-full px-4 text-sm font-bold",
                on
                  ? "bg-foreground text-background"
                  : "border border-foreground/20 bg-background hover:bg-muted",
              )}
            >
              {p.name}
            </button>
          );
        })}
      </fieldset>
    ) : null;
  // O que fica a confirmar na revisão: as atividades, quem mais acompanha as
  // crianças delas, e as palavras do título e do botão.
  const draftTypes = drafts.map((d) => d.value.type);
  // Todas do mesmo tipo, o título já diz qual ("4 provas"); misturadas, cada
  // linha diz o seu.
  const mixedTypes = new Set(draftTypes).size > 1;
  const otherAdults = [
    ...new Set(
      adults
        .filter((adult) => requiredSourceIds.includes(adult.profileId) && adult.userId !== viewerId)
        .map((adult) => adult.name.trim().split(/\s+/)[0] ?? adult.name),
    ),
  ];
  const originalWord = isImage ? "a foto" : "o recado";
  const ownsSource =
    ownProfileIds && requiredSourceIds.length
      ? requiredSourceIds.every((id) => ownProfileIds.includes(id))
      : viewerIsOwner;
  const keptWith = ownsSource ? "só com você" : "só com você e com quem assina a Agenda";
  const sticky =
    "sticky -mx-4 mt-4 border-t border-foreground/15 bg-app-ground px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]";

  return (
    <div data-immersive={mode === "capture" ? "" : undefined} className="flex flex-col">
      {resumeUnavailable && !saved ? (
        <p role="status" className="mt-4 rounded-2xl bg-muted p-4 text-sm">
          Aquele recado não está mais esperando conferência: ele foi salvo ou descartado. Dá para
          mandar um recado novo aqui.
        </p>
      ) : null}
      {saved ? (
        <section
          role="status"
          aria-labelledby="capture-saved-title"
          className="flex min-h-[calc(100dvh-4rem)] flex-col gap-[18px] px-1 pt-10 pb-6 lg:min-h-0"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-chart-2/18">
            <Check className="size-8 text-chart-2-ink" strokeWidth={2.6} aria-hidden />
          </span>
          <h1
            id="capture-saved-title"
            ref={savedHeading}
            tabIndex={-1}
            className="text-[32px] font-extrabold leading-[1.08] tracking-[-0.04em] outline-none"
          >
            Pronto. {countedNoun(saved.types)} {saved.count === 1 ? "está" : "estão"}{" "}
            {saved.firstDue ? "na semana" : "na Agenda"} de{" "}
            {joinNames(saved.profileIds.map(profileName).filter(Boolean))}.
          </h1>
          <p className="text-base leading-normal text-foreground/80">
            {saved.firstDue
              ? firstDueSentence(saved.count, saved.firstDue, todayIso)
              : "Sem data por enquanto: fica em Para hoje até alguém marcar o dia."}
            {saved.reminders ? ` ${saved.reminders}` : ""}
          </p>
          {saved.shareIds.length && shareStep !== "skipped" ? (
            <div className="mt-1.5 flex flex-col gap-2.5 rounded-[20px] border border-foreground/15 bg-background p-[18px]">
              {shareStep === "done" ? (
                <p className="text-[15px] font-bold">
                  {sharedCount === 0
                    ? "Nenhuma foi para a turma. Elas continuam na agenda de vocês."
                    : `${sharedCount === 1 ? "Foi" : "Foram"} para a turma${saved.turma ? ` do ${saved.turma}` : ""}. As outras famílias decidem se aceitam.`}
                </p>
              ) : (
                <>
                  <h2 className="text-lg font-bold">
                    Mandar para a turma{saved.turma ? ` do ${saved.turma}` : ""}?
                  </h2>
                  <p className="text-sm leading-normal text-foreground/80">
                    As outras famílias recebem{" "}
                    {saved.shareIds.length === 1 ? "a mesma" : "as mesmas"}{" "}
                    {saved.shareIds.length === 1
                      ? singularNoun(saved.shareTypes)
                      : pluralNoun(saved.shareTypes)}{" "}
                    e decidem se aceitam. Se a escola mudar uma data, você corrige para todo mundo.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={shareStep === "sending"}
                      onClick={shareSaved}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-[15px] font-bold text-background disabled:opacity-60"
                    >
                      {shareStep === "sending" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : null}
                      Mandar para a turma
                    </button>
                    <button
                      type="button"
                      disabled={shareStep === "sending"}
                      onClick={() => setShareStep("skipped")}
                      className="inline-flex min-h-11 items-center px-3 text-[15px] font-bold hover:underline"
                    >
                      Agora não
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
          <div className="mt-auto flex flex-col gap-2.5 pt-4">
            <Link
              href={`/calendario?view=week${saved.firstDue ? `&date=${saved.firstDue}` : ""}${saved.profileIds.length === 1 ? `&perfil=${saved.profileIds[0]}` : ""}`}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground shadow-solid-primary"
            >
              Ver na semana
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="min-h-11 text-[15px] font-bold text-primary-ink hover:underline"
            >
              Trazer outro recado
            </button>
          </div>
        </section>
      ) : !profiles.length ? (
        <section
          key="create-profile"
          className="mt-4 space-y-4 rounded-[20px] border border-foreground/15 bg-background p-5"
        >
          <h1 className="text-xl font-extrabold tracking-tight">Como se chama a criança?</h1>
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
        <div className="mt-4">
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
        </div>
      ) : reading ? (
        <section
          role="status"
          aria-live="polite"
          className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-[22px] px-6 text-center lg:min-h-[480px]"
        >
          <div className="flex gap-2.5" aria-hidden>
            <span className="size-3.5 rounded-full bg-primary motion-safe:animate-pulse" />
            <span className="size-3.5 rounded-full bg-primary/55 motion-safe:animate-pulse motion-safe:[animation-delay:200ms]" />
            <span className="size-3.5 rounded-full bg-primary/25 motion-safe:animate-pulse motion-safe:[animation-delay:400ms]" />
          </div>
          <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.03em]">
            Lendo{" "}
            {isImage || photos.length ? "a foto" : primary === "colar" ? "a mensagem" : "o recado"}{" "}
            de {childName}
          </h1>
          <p className="text-base leading-[1.55] text-foreground/80">
            A Agenda separa uma atividade por matéria e por prazo. Se a escola não deu data, fica a
            confirmar.
          </p>
        </section>
      ) : !drafts.length ? (
        <section
          key="capture-notice"
          aria-labelledby="capture-title"
          className={cn(
            "flex flex-col",
            primary === "foto" && "min-h-[calc(100dvh-1rem)] lg:min-h-0",
          )}
        >
          <div className="-mx-2 flex h-14 items-center justify-between gap-2">
            <Link
              href="/dashboard"
              className="flex min-h-11 items-center px-3 text-[15px] font-bold"
            >
              Cancelar
            </Link>
            <h1 id="capture-title" className="truncate text-base font-bold">
              {formTitle}
            </h1>
            <span className="w-[84px] shrink-0" aria-hidden />
          </div>
          {childPills}

          {primary === "foto" ? (
            <div className="relative mt-1 flex h-[calc(100dvh-18.25rem)] min-h-[340px] items-center justify-center overflow-hidden rounded-[22px] bg-foreground lg:h-[480px]">
              {shownPhoto ? (
                <>
                  <Image
                    src={shownPhoto}
                    alt="Foto selecionada para leitura"
                    width={800}
                    height={1000}
                    unoptimized
                    className="max-h-full w-full object-contain"
                  />
                  <span className="absolute left-3.5 top-3.5 inline-flex h-7 items-center rounded-full bg-foreground/70 px-2.5 text-[13px] font-bold text-background">
                    Página {pageNumber} de até {MAX_PHOTOS}
                  </span>
                </>
              ) : attachment ? (
                <p className="flex items-center gap-2 px-6 text-center text-[15px] font-bold text-background">
                  <FileUp className="size-5 shrink-0" aria-hidden />
                  <span className="break-all">{attachment.name}</span>
                </p>
              ) : (
                <div className="flex max-w-[280px] flex-col items-center gap-3 text-center">
                  {cameraButton}
                  {fileButton}
                  <p className="text-sm leading-normal text-background/75">
                    Fotografe a página inteira, com boa luz e sem cortar as anotações. Agenda de
                    duas páginas vira um recado só: tire a primeira e toque em Outra página.
                  </p>
                </div>
              )}
            </div>
          ) : null}
          {primary === "foto" && attachment ? (
            <div className="flex gap-2.5 pt-3.5">
              {isImage || photos.length ? (
                <label
                  htmlFor="notice-more-photos"
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-foreground/15 bg-background px-3.5 text-sm font-bold focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
                >
                  <Plus className="size-[18px]" aria-hidden />
                  Outra página
                  {photoInput(
                    "notice-more-photos",
                    (file) => void addPhoto(file),
                    busy || photos.length >= MAX_PHOTOS,
                  )}
                </label>
              ) : null}
              <label
                htmlFor="notice-retake"
                className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-foreground/15 bg-background px-3.5 text-sm font-bold focus-within:ring-2 focus-within:ring-ring hover:bg-muted"
              >
                {isImage || photos.length ? "Tirar de novo" : "Trocar arquivo"}
                {photoInput("notice-retake", (file) => {
                  setSource("notebook");
                  void chooseFile(file);
                })}
              </label>
            </div>
          ) : null}

          {primary !== "foto" ? (
            <div className="mt-1 flex flex-col gap-3">
              {dictation ? voiceField : null}
              {textIsPrimary ? textField : null}
              {primary === "colar" ? (
                <div className="space-y-2">
                  {fileButton}
                  <p className="text-sm text-muted-foreground">
                    Print, PDF ou a conversa exportada do WhatsApp (.txt), sem mídia: você escolhe
                    as mensagens.
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
                <div className="space-y-3 rounded-2xl border border-foreground/15 bg-background p-3">
                  <p className="break-words text-sm font-semibold">
                    {photos.length > 1
                      ? `${photos.length} páginas, de até ${MAX_PHOTOS}, num PDF só`
                      : isImage
                        ? `Página 1 de até ${MAX_PHOTOS}`
                        : `Arquivo: ${attachment.name}`}
                  </p>
                  {isImage ? (
                    <Image
                      src={attachment.dataUrl}
                      alt="Foto selecionada para leitura"
                      width={800}
                      height={600}
                      unoptimized
                      className="max-h-72 w-full rounded-xl object-contain"
                    />
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
                    Trocar arquivo
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {pageCount > 0 && !photos.length ? (
            <fieldset className="mt-3 space-y-3 rounded-2xl border border-foreground/15 bg-background p-4">
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
          <details className="mt-2.5 border-t border-foreground/15">
            <summary className="flex min-h-12 cursor-pointer list-none items-center text-[15px] font-bold [&::-webkit-details-marker]:hidden">
              Mais opções:{" "}
              {primary === "foto" ? "observação, data e link" : "de onde veio, data e link"}
            </summary>
            <div className="grid gap-4 pb-3">
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

          {error ? <div className="pt-2">{errorBox}</div> : null}
          <div className="mt-auto flex flex-col gap-2.5 pb-5 pt-3">
            <button
              type="button"
              onClick={extract}
              disabled={busy || (!text.trim() && !attachment)}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground shadow-solid-primary disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Ler o recado
            </button>
            <p className="text-center text-[13px] leading-normal text-muted-foreground">
              {isPro
                ? `Usa ${dictation ? "2 leituras" : "1 leitura"}. Nada é salvo antes de você conferir.`
                : `Os primeiros recados são por nossa conta. Nada é salvo antes de você conferir.`}{" "}
              A leitura passa por um serviço de inteligência artificial.
            </p>
          </div>
        </section>
      ) : (
        <section key="review-actions" aria-labelledby="review-title" className="flex flex-col">
          {mode === "manual" ? null : (
            <div className="flex flex-col gap-1 px-1 pb-2.5 pt-[18px]">
              <h1
                id="review-title"
                className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em]"
              >
                {noticeId
                  ? `Achei ${countedNoun(draftTypes)} para ${draftNames}`
                  : drafts.length === 1
                    ? "Escreva a atividade"
                    : "Escreva as atividades"}
              </h1>
              <p className="text-[15px] text-muted-foreground">
                {noticeId
                  ? "Confira as datas. O que a escola não disse fica a confirmar."
                  : "Sem leitura: fica como você escrever."}
              </p>
            </div>
          )}
          {warnings.length ? (
            <ul className="mb-3 list-disc space-y-1 rounded-2xl bg-chart-4/10 p-4 pl-8 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          {appliedProfileIds.length ? (
            <p role="status" className="mb-3 rounded-2xl bg-muted p-4 text-sm">
              Este recado já foi lido para{" "}
              {joinNames(
                profiles.filter((p) => appliedProfileIds.includes(p.id)).map((p) => p.name),
              )}
              . Revisar para outra criança não gasta outra leitura. As atividades de antes
              continuam; para mudar alguma, abra Atividades.
            </p>
          ) : null}
          {publicationReference ? (
            <div className="mb-3 rounded-2xl border border-foreground/15 bg-background p-4 text-sm">
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

          <ul className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background">
            {drafts.map((draft, index) => {
              const subject = subjectFor(draft.value);
              const open = isOpen(draft, index);
              const regionId = `${draft.key}-details`;
              const title = draft.value.title.trim() || "Sem título ainda";
              return (
                <li key={draft.key} className="border-t border-foreground/15 first:border-t-0">
                  <div className="flex items-start gap-3 py-3.5 pl-4 pr-3.5">
                    {/* A linha inteira abre os detalhes, como tocar numa linha
                        da agenda: o canvas não tem um "ver detalhes" à parte. */}
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={regionId}
                      onClick={() =>
                        setOpenDrafts((current) => ({ ...current, [draft.key]: !open }))
                      }
                      className="flex min-w-0 flex-1 flex-col items-start gap-[5px] rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="break-words text-base font-bold leading-snug">{title}</span>
                      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <span
                          aria-hidden
                          className={cn(
                            "size-[9px] shrink-0 rounded-full",
                            subject
                              ? (DOT_CLASS[subject.colorIndex] ?? "bg-foreground/70")
                              : "border-[1.5px] border-dashed border-muted-foreground",
                          )}
                        />
                        {subject?.name ?? "Sem matéria"}
                        {mixedTypes ? ` · ${ACTIVITY_TYPE_LABELS[draft.value.type]}` : ""}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-7 items-center rounded-full border border-foreground/15 px-2.5 text-[13px] font-bold">
                          {draft.value.dueAt
                            ? `${shortDayLabel(draft.value.dueAt, todayIso)}${draft.value.time ? ` · ${formatClockTime(draft.value.time)}` : ""}`
                            : "sem data"}
                        </span>
                        <span className="text-[13px] font-semibold text-foreground/75">
                          {draft.value.dueAt ? ORIGIN_SHORT[draft.value.dateOrigin] : "a confirmar"}
                          {draft.value.shareWithTurma ? " · vai para a turma" : ""}
                        </span>
                      </span>
                      {draft.subjectHint && !subject ? (
                        <span className="text-[13px] font-semibold leading-[1.4] text-chart-4-ink">
                          {draft.subjectHint} não está nas matérias de{" "}
                          {profileName(draft.value.profileId)}.{" "}
                          <span className="underline">Escolher a matéria</span>
                        </span>
                      ) : null}
                      <span className="sr-only">
                        {open ? "Fechar os detalhes" : "Ver e mudar os detalhes"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 min-w-[68px] shrink-0 items-center justify-center rounded-xl border border-foreground/20 px-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
                      aria-label={`Tirar a atividade ${index + 1}`}
                      disabled={busy || (mode === "manual" && drafts.length === 1)}
                      onClick={() => void removeDraft(draft)}
                    >
                      Tirar
                    </button>
                  </div>
                  <div
                    id={regionId}
                    hidden={!open}
                    className="border-t border-foreground/15 px-4 pb-2 pt-4"
                  >
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
                    <button
                      type="button"
                      className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-primary-ink hover:underline"
                      onClick={() =>
                        setOpenDrafts((current) => ({ ...current, [draft.key]: false }))
                      }
                    >
                      Fechar os detalhes
                    </button>
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
                        Ao corrigir, o que já foi feito e o histórico continuam. O lembrete de antes
                        é trocado pelo desta revisão.
                      </span>
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {noticeId ? (
            <div className="px-1 pb-2 pt-4">
              <label htmlFor="share-original" className="flex cursor-pointer items-start gap-3">
                <input
                  id="share-original"
                  type="checkbox"
                  className="mt-0.5 size-[22px] shrink-0 accent-primary"
                  checked={shareOriginal}
                  onChange={(e) => setShareOriginal(e.target.checked)}
                />
                <span className="text-sm leading-[1.45]">
                  <b className="block text-[15px]">O recado fala só de {sourceNames}</b>
                  <span className="text-muted-foreground">
                    Assim{" "}
                    {otherAdults.length
                      ? `${joinNames(otherAdults)} também ${otherAdults.length === 1 ? "pode" : "podem"}`
                      : `quem acompanha ${sourceNames} também pode`}{" "}
                    ver {originalWord}. Se falar de outra criança, {originalWord} fica {keptWith}.
                  </span>
                </span>
              </label>
              {shareOriginal && profiles.some((p) => !requiredSourceIds.includes(p.id)) ? (
                <fieldset className="ml-[34px] mt-3 space-y-1 border-t border-foreground/15 pt-3">
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

          {/* O que o canvas não desenha e a casa ainda precisa: escrever uma
              que a leitura não achou, deixar para depois e descartar. */}
          <div className="flex flex-wrap gap-x-4 px-1">
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-bold text-primary-ink hover:underline disabled:opacity-50"
              onClick={() => {
                setDrafts([...drafts, blankAction(profileId)]);
                resetDecisions();
              }}
              disabled={drafts.length >= 30}
            >
              Escrever mais uma
            </button>
            {mode === "manual" ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-sm font-bold hover:underline"
                disabled={busy}
                onClick={() => router.push("/atividades")}
              >
                Cancelar
              </button>
            ) : noticeId && !noticeConfirmed ? (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center text-sm font-bold hover:underline"
                >
                  Continuar depois
                </Link>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-sm font-bold text-destructive-ink hover:underline"
                  disabled={busy}
                  onClick={() => setDiscardOpen(true)}
                >
                  Descartar o recado
                </button>
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
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-sm font-bold hover:underline"
                disabled={busy}
                onClick={resetToImport}
              >
                Voltar ao recado
              </button>
            )}
          </div>
          {duplicates.length ? (
            <div className="mt-3 space-y-3 rounded-2xl bg-chart-4/10 p-4">
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
          {/* Na revisão o erro fica junto do botão que o causou. */}
          {error ? <div className="mt-3">{errorBox}</div> : null}
          <div
            className={cn(
              sticky,
              mode === "manual"
                ? "bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-0"
                : "bottom-0",
            )}
          >
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary text-[17px] font-extrabold text-primary-foreground shadow-solid-primary disabled:opacity-60"
            >
              {busy ? "Salvando…" : `Salvar ${countedNoun(draftTypes)}`}
            </button>
          </div>
        </section>
      )}
      {!drafts.length && !reading && !saved && warnings.length ? (
        <div role="status" className="mt-3 space-y-2 rounded-2xl bg-chart-4/10 p-4 text-sm">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {error && !inReview && !importStep ? <div className="mt-3">{errorBox}</div> : null}
    </div>
  );
}
