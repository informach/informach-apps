import {
  cutTargets,
  type Issue,
  paragraphs,
  type TimelineWord,
  timelineProtected,
  wordsToSource,
} from "@shared/cleanup";
import { newId, trackLabels } from "@shared/timeline";
import type { EngineStatus } from "@shared/types";
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
import {
  cutRanges,
  cutRangesInteractive,
  runEngineInstall,
  runModelInstall,
  speechCandidates,
  type TextModel,
  transcribeAssets,
  useCleanup,
  useEngine,
  useTextModel,
  useTranscribing,
  useTranscripts,
  wordsRange,
} from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, Progress } from "@/ui";

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
      <CleanupBar model={model} />
      <TranscriptText model={model} />
      <div className="transcript-foot">
        <Info size={13} />
        <span>
          Selecione palavras e aperte Delete para cortar o trecho do vídeo. Clique direito numa
          marcação para mantê-la.
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
          {status.model && <ModelPicker status={status} />}
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

function ModelPicker({ status }: { status: EngineStatus }): ReactNode {
  if (!status.model) return null;
  return (
    <select
      className="select"
      value={status.model.path}
      onChange={async (e) =>
        useEngine.setState({ status: await window.api.selectModel(e.target.value) })
      }
    >
      {status.models.map((m) => (
        <option key={m.path} value={m.path}>
          {m.name} · {bytes(m.size)}
          {m.path.toLowerCase().startsWith("c:\\whisper-cpp") ? " · C:\\whisper-cpp" : ""}
        </option>
      ))}
    </select>
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
  const course = project.course ?? "";
  const [glossary, setGlossaryText] = useState("");
  useEffect(() => {
    void window.api.getGlossary(course).then((terms) => setGlossaryText(terms.join(", ")));
  }, [course]);
  const saveGlossary = (): void => {
    void window.api.setGlossary(course, glossary.split(/[,\n;]/));
  };
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
          Escolha o áudio com a sua fala. Normalmente é só a gravação principal — transcrever duas
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
      <label className="field">
        <span className="field-label">
          Glossário {course ? `do curso ${course}` : "(projetos sem curso)"}
        </span>
        <textarea
          className="input glossary"
          rows={2}
          value={glossary}
          disabled={busy}
          placeholder="Nomes e termos que a transcrição deve acertar. Ex.: Debinha, Zappy, bloco Quando clicar"
          onChange={(e) => setGlossaryText(e.target.value)}
          onBlur={saveGlossary}
        />
        <span className="field-hint">
          Separe por vírgulas. Vale para todas as aulas deste curso e também orienta a IA.
        </span>
      </label>
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
            saveGlossary();
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

function CleanupBar({ model }: { model: TextModel }): ReactNode {
  const project = useProject((s) => s.project)!;
  const { kinds, minSilence, set } = useCleanup();
  const counts = { filler: 0, silence: 0, repeat: 0 };
  for (const i of model.active) counts[i.kind]++;
  const labels = trackLabels(project.tracks);
  const targets = cutTargets(project);
  const spared = project.tracks.filter(
    (t) => !targets.has(t.id) && project.clips.some((c) => c.trackId === t.id),
  );

  const cutAll = (): void => {
    const n = model.active.length;
    cutRanges(model.active.map((i) => [i.start, i.end]));
    useCleanup.getState().set({ kept: new Set() });
    useApp
      .getState()
      .toast(`${n} cortes aplicados (${duration(model.saved)} a menos). Ctrl+Z desfaz.`, "success");
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
            onClick={() => set({ kinds: { ...kinds, [k]: !kinds[k] } })}
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
          onChange={(e) => set({ minSilence: Number(e.target.value) })}
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
        disabled={!model.active.length}
        onClick={cutAll}
      >
        Cortar tudo na timeline
      </Button>
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

function TranscriptText({ model }: { model: TextModel }): ReactNode {
  const fps = useProject((s) => s.project?.settings.fps ?? 30);
  const { kept, toggleKept, keepPause } = useCleanup();
  const textCut = useApp((s) => s.textCut);
  const [selection, setSelection] = useState<{
    words: TextModel["words"];
    range: [number, number];
  } | null>(null);
  const dragging = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { words, issues, active } = model;
  const sel = selection?.words === words ? selection.range : null;
  const setSel = (range: [number, number] | null): void =>
    setSelection(range ? { words, range } : null);

  const index = useMemo(() => new Map(words.map((w, i) => [w.key, i])), [words]);
  const project = useProject((s) => s.project)!;
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

  // Word key -> issue, and word index -> silence issue that follows it.
  const { wordIssue, silenceAfter } = useMemo(() => {
    const wordIssue = new Map<string, Issue>();
    const silenceAfter = new Map<number, Issue>();
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
        silenceAfter.set(at, i);
      } else for (const k of i.words) wordIssue.set(k, i);
    }
    return { wordIssue, silenceAfter };
  }, [issues, words]);
  const activeIds = useMemo(() => new Set(active.map((i) => i.id)), [active]);

  // Selection changes are mirrored as a timeline range so the Delete key can cut it.
  useEffect(() => {
    useApp.getState().set({
      textCut: sel && words[sel[0]] && words[sel[1]] ? wordsRange(words, sel[0], sel[1]) : null,
    });
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
    if (w.p < 0.5) c += " w-unsure";
    if (protectedBy.has(w.key)) c += " w-protected";
    return c;
  };

  return (
    <>
      <div className="transcript-body" ref={bodyRef}>
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
              <p>
                {para.map((w) => {
                  const i = index.get(w.key)!;
                  const silence = silenceAfter.get(i);
                  const issue = wordIssue.get(w.key);
                  return (
                    <span key={w.key}>
                      <button
                        type="button"
                        data-i={i}
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
                        onContextMenu={(e) => {
                          if (!issue) return;
                          e.preventDefault();
                          toggleKept(issue.id);
                        }}
                        title={
                          issue
                            ? activeIds.has(issue.id)
                              ? `${KIND_META[issue.kind].label} — clique direito para manter`
                              : "Mantido — clique direito para cortar"
                            : undefined
                        }
                      >
                        {i > 0 && /[.!?]$/.test(words[i - 1].text)
                          ? w.text.charAt(0).toUpperCase() + w.text.slice(1)
                          : w.text}
                      </button>{" "}
                      {silence && (
                        <button
                          type="button"
                          className={`pause-pill ${activeIds.has(silence.id) ? "" : "is-kept"}`}
                          onClick={() => toggleKept(silence.id)}
                          title={
                            activeIds.has(silence.id)
                              ? "Silêncio será encurtado — clique para manter"
                              : "Mantido — clique para encurtar"
                          }
                        >
                          <Pause size={9} />
                          {(silence.end - silence.start + keepPause).toFixed(1).replace(".", ",")}s
                        </button>
                      )}
                    </span>
                  );
                })}
              </p>
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
