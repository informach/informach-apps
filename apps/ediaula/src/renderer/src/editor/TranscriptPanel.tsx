import {
  cutTargets,
  type Issue,
  paragraphs,
  type TimelineWord,
  timelineProtected,
  wordsToSource,
} from "@shared/cleanup";
import { newId, trackLabels } from "@shared/timeline";
import type { EngineStatus, Transcript } from "@shared/types";
import {
  Captions,
  Check,
  Cpu,
  Download,
  Film,
  Info,
  Lock,
  Music,
  Pause,
  Scissors,
  Shield,
  ShieldCheck,
  ShieldOff,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { bytes, duration, timecode } from "@/lib/format";
import { blindNotes, proposeCleanup } from "@/lib/proposals";
import {
  cleanError,
  cutRangesInteractive,
  runEngineInstall,
  runModelInstall,
  setCleanup,
  speechCandidates,
  type TextModel,
  toggleKept,
  transcribeAssets,
  useCleanup,
  useEngine,
  useTextModel,
  useTranscribing,
  useTranscripts,
  wordsRange,
} from "@/lib/transcripts";
import {
  countLike,
  type RemovedOnTimeline,
  restoreWord,
  shownByKey,
  useRemovedWords,
} from "@/lib/wordEditing";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Progress } from "@/ui";
import { GlossaryField } from "./GlossaryField";
import { WordEditor } from "./WordEditor";

const LANGUAGES: [string, string][] = [
  ["pt", "Português"],
  ["en", "Inglês"],
  ["es", "Espanhol"],
];

export function TranscriptPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const status = useEngine((s) => s.status);
  const transcripts = useTranscripts(project);
  const model = useTextModel(project, transcripts);

  useEffect(() => {
    void useEngine.getState().refresh();
  }, []);

  // Show the pending cuts on the timeline while this panel is open.
  useEffect(() => {
    useApp.getState().set({
      cleanupMarks: model.active.map((i) => ({ start: i.start, end: i.end, kind: i.kind })),
    });
  }, [model.active]);
  useEffect(() => () => useApp.getState().set({ cleanupMarks: [], textCut: null }), []);

  if (!project) return null;
  if (!status) return <div className="empty side-empty">Verificando o motor de transcrição…</div>;
  if (!status.bin || !status.model) return <EngineSetup status={status} />;

  const pending = project.assets.some((a) => a.transcriptStatus === "pending");
  if (transcripts.size === 0 || (pending && model.words.length === 0))
    return <TranscribeStart status={status} />;

  return (
    <div className="transcript">
      <CleanupBar model={model} loading={model.loading} />
      <details className="transcript-glossary">
        <summary>Glossário do curso</summary>
        <GlossaryField hint="Corrige os nomes no texto na hora, sem transcrever de novo. Vale para todas as aulas do curso e também orienta a IA." />
      </details>
      <TranscriptText model={model} transcripts={transcripts} />
      <div className="transcript-foot">
        <Info size={13} />
        <span>
          Selecione palavras e aperte Delete para cortar o trecho do vídeo. Duplo clique numa
          palavra corrige o texto. Clique direito numa marcação para mantê-la.
        </span>
      </div>
    </div>
  );
}

/* ---------- Setup ---------- */

function useJob(prefix: string): number | null {
  const jobs = useApp((s) => s.jobs);
  const job = Object.values(jobs).find((j) => j.label.startsWith(prefix));
  return job ? job.ratio : null;
}

function EngineSetup({ status }: { status: EngineStatus }): ReactNode {
  const engineJob = useJob("Baixando motor");
  const modelJob = useJob("Baixando modelo");
  const hasTurbo = status.models.some((m) => m.name.includes("turbo"));

  return (
    <div className="setup">
      <div className="setup-head">
        <Captions size={22} className="accent" />
        <strong>Transcrição no seu computador</strong>
        <p className="muted">
          O áudio é processado aqui mesmo, com o whisper.cpp. Nada é enviado para a internet.
          Precisa de duas instalações, uma vez só.
        </p>
      </div>

      <div className={`setup-step ${status.bin ? "is-done" : ""}`}>
        <span className="step-num">{status.bin ? <Check size={13} /> : 1}</span>
        <div className="setup-body">
          <strong>Motor de transcrição</strong>
          {status.bin ? (
            <span className="muted">
              Instalado ·{" "}
              {status.variant === "cuda" ? "placa de vídeo NVIDIA" : "processador (CPU)"}
            </span>
          ) : engineJob !== null ? (
            <>
              <span className="muted">Baixando e instalando…</span>
              <Progress ratio={engineJob} />
            </>
          ) : (
            <div className="setup-options">
              {status.gpu && (
                <button
                  type="button"
                  className="setup-option is-recommended"
                  onClick={() => void runEngineInstall("cuda")}
                >
                  <Zap size={16} />
                  <span>
                    <strong>Placa NVIDIA (recomendado)</strong>
                    <span>Cerca de 20× mais rápido · download de ~685 MB</span>
                  </span>
                </button>
              )}
              <button
                type="button"
                className="setup-option"
                onClick={() => void runEngineInstall("cpu")}
              >
                <Cpu size={16} />
                <span>
                  <strong>Só processador</strong>
                  <span>Funciona em qualquer PC, mais lento · ~9 MB</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`setup-step ${status.model ? "is-done" : ""}`}>
        <span className="step-num">{status.model ? <Check size={13} /> : 2}</span>
        <div className="setup-body">
          <strong>Modelo de idioma</strong>
          {status.model ? <ModelPicker status={status} /> : <ExternalModels status={status} />}
          {modelJob !== null ? (
            <>
              <span className="muted">Baixando modelo…</span>
              <Progress ratio={modelJob} />
            </>
          ) : (
            !hasTurbo && (
              <div className="setup-options">
                <button
                  type="button"
                  className="setup-option is-recommended"
                  onClick={() => void runModelInstall("large-v3-turbo-q5_0")}
                >
                  <Download size={16} />
                  <span>
                    <strong>large-v3-turbo (mais preciso)</strong>
                    <span>
                      Ótimo em português · 574 MB
                      {status.variant === "cpu" ? " · lento sem GPU" : ""}
                    </span>
                  </span>
                </button>
                {!status.model && (
                  <button
                    type="button"
                    className="setup-option"
                    onClick={() => void runModelInstall("small")}
                  >
                    <Download size={16} />
                    <span>
                      <strong>small (mais leve)</strong>
                      <span>Bom para PCs sem placa de vídeo · 466 MB</span>
                    </span>
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const engineError = (err: unknown): void => useApp.getState().toast(cleanError(err), "error");

function ModelPicker({ status }: { status: EngineStatus }): ReactNode {
  if (!status.model) return null;
  return (
    <>
      <select
        className="select"
        value={status.model.path}
        onChange={(e) =>
          window.api
            .selectModel(e.target.value)
            .then((next) => useEngine.setState({ status: next }))
            .catch(engineError)
        }
      >
        {status.models.map((m) => (
          <option key={m.path} value={m.path}>
            {m.name} · {bytes(m.size)}
            {m.unchecked ? " · não conferido" : ""}
          </option>
        ))}
      </select>
      <ExternalModels status={status} />
    </>
  );
}

/**
 * Models kept in C:\whisper-cpp are listed only when the person asks: EdiAula cannot check
 * them against a published hash.
 */
function ExternalModels({ status }: { status: EngineStatus }): ReactNode {
  return (
    <label className="w-edit-check muted small">
      <input
        type="checkbox"
        checked={status.externalModels}
        onChange={(e) =>
          window.api
            .setExternalModels(e.target.checked)
            .then((next) => useEngine.setState({ status: next }))
            .catch(engineError)
        }
      />
      Usar também os modelos de C:\whisper-cpp. O EdiAula não confere esses arquivos.
    </label>
  );
}

function TranscribeStart({ status }: { status: EngineStatus }): ReactNode {
  const project = useProject((s) => s.project)!;
  const running = useTranscribing();
  const jobs = useApp((s) => s.jobs);
  const language = useCleanup((s) => s.language);
  const candidates = speechCandidates(project);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(candidates.slice(0, 1).map((c) => c.asset.id)),
  );
  const touched = useRef(false);
  const busy = Object.keys(running).length > 0;
  const firstId = candidates[0]?.asset.id;
  // Pre-select the main recording once it shows up on the timeline.
  useEffect(() => {
    if (!touched.current && firstId) setPicked(new Set([firstId]));
  }, [firstId]);

  if (!candidates.length) {
    return (
      <div className="empty side-empty">
        <Captions size={28} className="accent" />
        <span className="empty-title">Coloque a gravação na timeline</span>
        <span>A transcrição usa o áudio dos clipes que estão na timeline.</span>
      </div>
    );
  }

  const toggle = (id: string): void => {
    touched.current = true;
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <div className="setup">
      <div className="setup-head">
        <Wand2 size={22} className="accent" />
        <strong>Transcrever a aula</strong>
        <p className="muted">
          Escolha o áudio com a sua fala. Normalmente é só a gravação principal: transcrever duas
          fontes da mesma fala duplica o texto.
        </p>
      </div>
      <div className="cand-list">
        {candidates.map(({ asset, used }) => {
          const jobId = running[asset.id];
          return (
            <label key={asset.id} className={`cand ${picked.has(asset.id) ? "is-picked" : ""}`}>
              <input
                type="checkbox"
                checked={picked.has(asset.id)}
                disabled={busy}
                onChange={() => toggle(asset.id)}
              />
              {asset.kind === "audio" ? <Music size={15} /> : <Film size={15} />}
              <span className="cand-text">
                <strong>{asset.name}</strong>
                <span className="muted">
                  {duration(used)} na timeline
                  {asset.transcriptStatus === "error" ? " · falhou, tente de novo" : ""}
                </span>
                {jobId && <Progress ratio={jobs[jobId]?.ratio ?? 0} />}
              </span>
            </label>
          );
        })}
      </div>
      <GlossaryField
        disabled={busy}
        hint="Separe por vírgulas. Vale para todas as aulas deste curso e também orienta a IA."
      />
      <div className="row-10">
        <select
          className="select lang"
          value={language}
          disabled={busy}
          onChange={(e) => useCleanup.getState().set({ language: e.target.value })}
        >
          {LANGUAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          icon={Captions}
          disabled={busy || picked.size === 0}
          onClick={() => {
            void transcribeAssets(
              candidates.filter((c) => picked.has(c.asset.id)).map((c) => c.asset),
              language,
            );
          }}
        >
          {busy ? "Transcrevendo…" : "Transcrever"}
        </Button>
      </div>
      <p className="muted small">
        Modelo {status.model?.name} · {status.variant === "cuda" ? "GPU" : "CPU"}.{" "}
        {status.variant === "cuda"
          ? "Uma aula de 30 min leva cerca de 2 min."
          : "Na CPU pode levar perto do tempo da aula."}
      </p>
    </div>
  );
}

/* ---------- Cleanup ---------- */

const KIND_META = {
  filler: { label: "vícios de fala", color: "var(--amber)" },
  silence: { label: "silêncios", color: "var(--violet)" },
  repeat: { label: "repetições", color: "var(--blue)" },
} as const;

function CleanupBar({ model, loading }: { model: TextModel; loading: boolean }): ReactNode {
  const project = useProject((s) => s.project)!;
  const { kinds, minSilence } = model.choices;
  const counts = { filler: 0, silence: 0, repeat: 0 };
  for (const i of model.active) counts[i.kind]++;
  const labels = trackLabels(project.tracks);
  const targets = cutTargets(project);
  const spared = project.tracks.filter(
    (t) => !targets.has(t.id) && project.clips.some((c) => c.trackId === t.id),
  );
  const notes = blindNotes(project, model.blind);
  const [busy, setBusy] = useState(false);

  // Everything goes through the proposal bar, item by item, like the Assistente's button.
  const propose = (): void => {
    setBusy(true);
    void proposeCleanup()
      .then((r) => useApp.getState().toast(r.message.split("\n")[0], r.ok ? "info" : "error"))
      .catch((err: unknown) =>
        useApp.getState().toast(`Não consegui propor a limpeza: ${cleanError(err)}`, "error"),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="cleanup">
      <div className="cleanup-head">
        <Wand2 size={15} className="accent" />
        <strong>Limpeza automática</strong>
        <span className="spacer" />
        <span className="mono accent">−{duration(model.saved)} de aula</span>
      </div>
      <div className="cleanup-cards">
        {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
          <button
            type="button"
            key={k}
            className={`cleanup-card ${kinds[k] ? "" : "is-off"}`}
            onClick={() => setCleanup({ kinds: { ...kinds, [k]: !kinds[k] } })}
            title={kinds[k] ? "Clique para não cortar" : "Clique para incluir"}
          >
            <span className="row-6">
              <span className="swatch" style={{ background: KIND_META[k].color }} />
              <strong>{kinds[k] ? counts[k] : "—"}</strong>
            </span>
            <span className="muted">{KIND_META[k].label}</span>
          </button>
        ))}
      </div>
      <div className="row-6 cleanup-opts">
        <span className="muted">Silêncios a partir de</span>
        <select
          className="select select-sm"
          value={minSilence}
          onChange={(e) => setCleanup({ minSilence: Number(e.target.value) })}
        >
          {[0.5, 0.75, 1, 1.5, 2, 3].map((v) => (
            <option key={v} value={v}>
              {String(v).replace(".", ",")} s
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="primary"
        icon={Scissors}
        className="w-full"
        disabled={loading || busy || !model.active.length}
        onClick={propose}
      >
        {loading ? "Lendo o cursor, a tela e o som…" : "Propor a limpeza"}
      </Button>
      <div className="cleanup-targets muted">
        <Shield size={12} />
        <span>
          Só encurta pausa em que ninguém fala e a tela fica parada: imagem que muda, ponteiro que
          se mexe, clique, arrasto, rolagem, atalho e digitação seguram a pausa. Depois de uma
          pergunta, ou onde o roteiro pede para esperar, a pausa fica com 2,5 s.
        </span>
      </div>
      {model.elsewhere > 0 && (
        <div className="cleanup-targets muted">
          <Info size={12} />
          <span>
            {model.elsewhere === 1
              ? "1 sugestão já está na proposta da limpeza da voz."
              : `${model.elsewhere} sugestões já estão na proposta da limpeza da voz.`}
          </span>
        </div>
      )}
      {notes.map((note) => (
        <div key={note} className="cleanup-targets muted">
          <Info size={12} />
          <span>{note}</span>
        </div>
      ))}
      <div className="cleanup-targets muted">
        <ShieldCheck size={12} />
        <span>
          Corta em {[...targets].map((id) => labels.get(id)).join(", ") || "nenhuma faixa"}
          {spared.length
            ? ` · preserva ${spared.map((t) => `${t.name} (${labels.get(t.id)})`).join(", ")}`
            : ""}
        </span>
        <span title="Trave uma faixa para que ela nunca seja cortada.">
          <Lock size={11} />
        </span>
      </div>
    </div>
  );
}

/* ---------- Text ---------- */

/** Below this confidence a word is marked for review. */
const UNSURE = 0.5;

/** Text of a word button's tooltip: what an issue, the glossary or the confidence say about it. */
function wordTitle(
  w: TimelineWord,
  issue: Issue | undefined,
  active: boolean,
  heard: string | undefined,
): string | undefined {
  if (issue)
    return active
      ? `${KIND_META[issue.kind].label}. Clique direito para manter.`
      : "Mantido. Clique direito para cortar.";
  const notes: string[] = [];
  if (heard) notes.push(`Corrigido pelo glossário: era "${heard}".`);
  if (w.p < UNSURE) notes.push(`Confiança baixa (${Math.round(w.p * 100)}%).`);
  return notes.length ? `${notes.join(" ")} Duplo clique ou F2 corrige.` : undefined;
}

/** First index whose word starts at or after `t` (words.length when none does). */
function firstFrom(words: TimelineWord[], t: number): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A word left out of the text, shown faded where it was said; a click brings it back. */
function Ghost({ word }: { word: RemovedOnTimeline }): ReactNode {
  const why =
    word.removed === "dropped"
      ? `O filtro tirou "${word.text}" por parecer invenção do Whisper.`
      : `"${word.text}" foi tirada da transcrição.`;
  return (
    <button
      type="button"
      className="w-ghost"
      title={`${why} Clique para restaurar.`}
      aria-label={`Restaurar a palavra ${word.text}`}
      onClick={() =>
        restoreWord(word.key).catch((err: unknown) =>
          useApp.getState().toast(`Não foi possível restaurar: ${cleanError(err)}`, "error"),
        )
      }
    >
      {word.text}
    </button>
  );
}

function TranscriptText({
  model,
  transcripts,
}: {
  model: TextModel;
  transcripts: Map<string, Transcript>;
}): ReactNode {
  const fps = useProject((s) => s.project?.settings.fps ?? 30);
  const { keepPause } = model.choices;
  const kept = model.keptIds;
  const textCut = useApp((s) => s.textCut);
  const [selection, setSelection] = useState<{
    words: TextModel["words"];
    range: [number, number];
  } | null>(null);
  const dragging = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Key of the word being corrected inline (double click). */
  const [editing, setEditing] = useState<string | null>(null);
  const { words, issues, active } = model;
  const sel = selection?.words === words ? selection.range : null;
  const setSel = (range: [number, number] | null): void =>
    setSelection(range ? { words, range } : null);

  const index = useMemo(() => new Map(words.map((w, i) => [w.key, i])), [words]);
  const project = useProject((s) => s.project)!;
  // The words as the transcript shows them (glossary marks, times in the media's seconds).
  const shown = useMemo(() => shownByKey(transcripts), [transcripts]);
  const lost = useMemo(
    () => [...transcripts.values()].reduce((n, t) => n + (t.lostEdits ?? 0), 0),
    [transcripts],
  );
  const occurrences = (like: string): number => countLike(transcripts, like);
  // Words left out of the text, by the index of the word they come before.
  const removed = useRemovedWords(project);
  const ghostsBefore = useMemo(() => {
    const map = new Map<number, RemovedOnTimeline[]>();
    for (const g of removed) {
      const at = firstFrom(words, g.start);
      map.set(at, [...(map.get(at) ?? []), g]);
    }
    return map;
  }, [removed, words]);
  // Closing the editor gives the focus back to the word.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (editing || !refocus) return;
    bodyRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(refocus)}"]`)?.focus();
    setRefocus(null);
  }, [editing, refocus]);
  const openEditor = (key: string): void => {
    dragging.current = null;
    setSel(null);
    setEditing(key);
  };
  // Word keys inside protected passages, and which protection covers each.
  const protectedBy = useMemo(() => {
    const map = new Map<string, string>();
    const prot = timelineProtected(project);
    for (const w of words) {
      const hit = prot.find((r) => Math.min(w.end, r.end) - Math.max(w.start, r.start) > 0.01);
      if (hit) map.set(w.key, hit.id);
    }
    return map;
  }, [project, words]);

  // Word key -> issue, and word index -> silence issues that follow it.
  const { wordIssue, silenceAfter } = useMemo(() => {
    const wordIssue = new Map<string, Issue>();
    const silenceAfter = new Map<number, Issue[]>();
    for (const i of issues) {
      if (i.kind === "silence") {
        let lo = 0;
        let hi = words.length - 1;
        let at = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (words[mid].end <= i.start + 0.05) {
            at = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        silenceAfter.set(at, [...(silenceAfter.get(at) ?? []), i]);
      } else for (const k of i.words) wordIssue.set(k, i);
    }
    return { wordIssue, silenceAfter };
  }, [issues, words]);
  const activeIds = useMemo(() => new Set(active.map((i) => i.id)), [active]);

  // Selection changes are mirrored as a timeline range so the Delete key can cut it. Selecting
  // words is the latest selection, so a selected cut on the timeline lets go.
  useEffect(() => {
    const textCut =
      sel && words[sel[0]] && words[sel[1]] ? wordsRange(words, sel[0], sel[1]) : null;
    useApp.getState().set(textCut ? { textCut, junction: null } : { textCut });
  }, [sel, words]);
  useEffect(() => {
    if (!textCut) setSelection(null);
  }, [textCut]);

  // Highlight the word being spoken without re-rendering thousands of spans.
  useEffect(() => {
    let current: HTMLElement | null = null;
    const update = (): void => {
      const { time, playing } = usePlayback.getState();
      let lo = 0;
      let hi = words.length - 1;
      let at = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid].start <= time) {
          at = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const el =
        at >= 0 && time < words[at].end + 0.3
          ? (bodyRef.current?.querySelector<HTMLElement>(`[data-i="${at}"]`) ?? null)
          : null;
      if (el === current) return;
      current?.classList.remove("is-now");
      el?.classList.add("is-now");
      current = el;
      if (el && playing) el.scrollIntoView({ block: "nearest" });
    };
    update();
    return usePlayback.subscribe(update);
  }, [words]);

  useEffect(() => {
    const up = (): void => {
      dragging.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const paras = useMemo(() => paragraphs(words), [words]);
  const lo = sel ? Math.min(sel[0], sel[1]) : -1;
  const hi = sel ? Math.max(sel[0], sel[1]) : -1;

  const wordClass = (w: TimelineWord, i: number): string => {
    const issue = wordIssue.get(w.key);
    let c = "w";
    if (issue)
      c += activeIds.has(issue.id) ? ` w-${issue.kind}` : kept.has(issue.id) ? " w-kept" : "";
    if (i >= lo && i <= hi) c += " is-sel";
    if (w.p < UNSURE) c += " w-unsure";
    if (shown.get(w.key)?.heard) c += " w-glossed";
    if (protectedBy.has(w.key)) c += " w-protected";
    return c;
  };

  return (
    <>
      <div className="transcript-body" ref={bodyRef}>
        <span id="w-unsure-hint" hidden>
          Reconhecimento com confiança baixa. F2 abre a correção.
        </span>
        {lost > 0 && (
          <div className="transcript-note">
            {lost === 1
              ? "1 correção feita antes não achou a palavra nesta transcrição."
              : `${lost} correções feitas antes não acharam a palavra nesta transcrição.`}
          </div>
        )}
        {paras.map((para) => {
          return (
            <div key={para[0].key} className="para">
              <button
                type="button"
                className="para-time mono"
                style={{ border: 0, padding: 0, background: "none" }}
                onClick={() => playback.seek(para[0].start)}
              >
                {timecode(para[0].start, fps)}
              </button>
              <div className="para-text">
                {para.map((w) => {
                  const i = index.get(w.key)!;
                  const pauses = silenceAfter.get(i) ?? [];
                  const issue = wordIssue.get(w.key);
                  return (
                    <span key={w.key}>
                      {ghostsBefore.get(i)?.map((g) => (
                        <Ghost key={g.key} word={g} />
                      ))}
                      {editing === w.key ? (
                        <WordEditor
                          word={w}
                          shown={shown.get(w.key)}
                          occurrences={occurrences}
                          onClose={() => {
                            setEditing(null);
                            setRefocus(w.key);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          data-i={i}
                          data-key={w.key}
                          aria-describedby={w.p < UNSURE ? "w-unsure-hint" : undefined}
                          onKeyDown={(e) => {
                            if (e.key !== "F2" && e.key !== "Enter") return;
                            e.preventDefault();
                            openEditor(w.key);
                          }}
                          style={{
                            border: 0,
                            padding: 0,
                            background: "none",
                            color: "inherit",
                            font: "inherit",
                          }}
                          onClick={(event) => {
                            if (event.detail !== 0) return;
                            setSel(event.shiftKey && sel ? [sel[0], i] : [i, i]);
                            playback.pause();
                            playback.seek(w.start);
                          }}
                          className={wordClass(w, i)}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            dragging.current = i;
                            setSel(e.shiftKey && sel ? [sel[0], i] : [i, i]);
                            playback.pause();
                            playback.seek(w.start);
                          }}
                          onMouseEnter={() =>
                            dragging.current !== null && setSel([dragging.current, i])
                          }
                          onDoubleClick={() => openEditor(w.key)}
                          onContextMenu={(e) => {
                            if (!issue) return;
                            e.preventDefault();
                            toggleKept(issue);
                          }}
                          title={wordTitle(
                            w,
                            issue,
                            !!issue && activeIds.has(issue.id),
                            shown.get(w.key)?.heard,
                          )}
                        >
                          {i > 0 && /[.!?]$/.test(words[i - 1].text)
                            ? w.text.charAt(0).toUpperCase() + w.text.slice(1)
                            : w.text}
                        </button>
                      )}{" "}
                      {pauses.map((silence) => (
                        <button
                          type="button"
                          key={silence.id}
                          className={`pause-pill ${activeIds.has(silence.id) ? "" : "is-kept"}`}
                          onClick={() => toggleKept(silence)}
                          title={
                            activeIds.has(silence.id)
                              ? "Silêncio será encurtado. Clique para manter."
                              : kept.has(silence.id)
                                ? "Mantido. Clique para encurtar."
                                : "Fora da limpeza (tipo desligado ou trecho protegido)."
                          }
                        >
                          <Pause size={9} />
                          {(silence.end - silence.start + keepPause).toFixed(1).replace(".", ",")}s
                        </button>
                      ))}
                    </span>
                  );
                })}
                {para === paras[paras.length - 1] &&
                  ghostsBefore.get(words.length)?.map((g) => <Ghost key={g.key} word={g} />)}
              </div>
            </div>
          );
        })}
      </div>
      {sel && (
        <div className="sel-bar">
          <span>
            {hi - lo + 1} {hi === lo ? "palavra" : "palavras"} ·{" "}
            {duration((textCut?.[1] ?? 0) - (textCut?.[0] ?? 0))}
          </span>
          <span className="spacer" />
          {(() => {
            const sel = words.slice(lo, hi + 1);
            const ids = new Set(
              sel.map((w) => protectedBy.get(w.key)).filter((x): x is string => !!x),
            );
            if (ids.size)
              return (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ShieldOff}
                  title="Permite cortar este trecho de novo"
                  onClick={() =>
                    useProject.getState().commit((p) => ({
                      ...p,
                      protected: (p.protected ?? []).filter((r) => !ids.has(r.id)),
                    }))
                  }
                >
                  Desproteger
                </Button>
              );
            return (
              <Button
                size="sm"
                variant="secondary"
                icon={Shield}
                title="Nenhum corte automático ou da IA vai tocar neste trecho"
                onClick={() => {
                  const label = sel
                    .map((w) => w.text)
                    .join(" ")
                    .slice(0, 40);
                  const ranges = wordsToSource(project, sel).map((src) => ({
                    id: newId("pr"),
                    ...src,
                    label,
                  }));
                  useProject
                    .getState()
                    .commit((p) => ({ ...p, protected: [...(p.protected ?? []), ...ranges] }));
                  setSel(null);
                }}
              >
                Proteger
              </Button>
            );
          })()}
          <Button
            size="sm"
            variant="primary"
            icon={Scissors}
            onClick={() => {
              if (textCut) cutRangesInteractive([textCut]);
              setSel(null);
            }}
          >
            Cortar trecho <kbd className="kbd kbd-dark">Del</kbd>
          </Button>
          <button
            type="button"
            className="icon-btn"
            title="Cancelar seleção"
            onClick={() => setSel(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
