import { lessonNotes } from "@shared/markers";
import { agree, plural } from "@shared/plural";
import { speechItems } from "@shared/script";
import { voiceClips, voiceSpan } from "@shared/voiceMaster";
import {
  Captions,
  Check,
  Download,
  FileAudio,
  ListChecks,
  MessageSquareText,
  Mic,
  MonitorPlay,
  PackageCheck,
  ScrollText,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useScreenCoverage } from "@/lib/coverage";
import { openRecorder } from "@/lib/recording";
import { scriptDoc } from "@/lib/script";
import { useEngine, useTranscribing } from "@/lib/transcripts";
import { importVoiceFiles, transcribeVoice } from "@/lib/voice";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type StepState = "done" | "current" | "todo";

function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  children: ReactNode;
}): ReactNode {
  return (
    <li
      className={`prepare-step is-${state}`}
      aria-current={state === "current" ? "step" : undefined}
    >
      <span className="prepare-mark">{state === "done" ? <Check size={12} /> : n}</span>
      <div className="prepare-body">
        <span className="prepare-title">{title}</span>
        {children}
      </div>
    </li>
  );
}

/**
 * "Gravação da aula": the way of whoever records the lesson, in four steps (script, voice,
 * screen, send to whoever edits it), each with where it stands and the one thing to do next.
 * The buttons are the ones of the Áudio panel and the menus, gathered in order.
 */
export function LessonFlowPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const running = useTranscribing();
  const jobs = useApp((s) => s.jobs);
  const engine = useEngine((s) => s.status);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void useEngine.getState().refresh();
  }, []);

  const doc = scriptDoc(project);
  const voice = useMemo(() => (project ? voiceClips(project) : []), [project]);
  const span = project ? voiceSpan(project) : null;
  const coverage = useScreenCoverage(project);
  if (!project) return null;

  const notes = lessonNotes(project);
  const parts = doc?.sections.length ?? 0;
  const lines = doc?.sections.reduce((n, s) => n + speechItems(s).length, 0) ?? 0;

  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const voiceAssets = [...new Set(voice.map((c) => c.assetId))].flatMap((id) => {
    const a = assets.get(id);
    return a ? [a] : [];
  });
  const hasVoice = voiceAssets.length > 0;
  const reading = voiceAssets.filter((a) => a.id in running || a.transcriptStatus === "pending");
  const read = voiceAssets.filter((a) => a.transcriptStatus === "ready").length;
  const failed = voiceAssets.some((a) => a.transcriptStatus === "error");
  const ratio = reading.map((a) => jobs[running[a.id] ?? ""]?.ratio).find((r) => r !== undefined);
  const noEngine = !!engine && (!engine.bin || !engine.model);
  const voiceRead = hasVoice && read === voiceAssets.length;

  const screenDone = !!coverage && coverage.total > 0 && coverage.firstGap === null;
  const anyScreen = !!coverage && coverage.covered > 0;
  const missing = coverage?.lines.filter((l) => l.status !== "done") ?? [];

  const state = (done: boolean, ready: boolean): StepState =>
    done ? "done" : ready ? "current" : "todo";
  const run = async (label: string, work: () => Promise<unknown>): Promise<void> => {
    setBusy(label);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };
  const transcribeNow = async (): Promise<void> => {
    const result = await transcribeVoice(true);
    if (result === "no-engine") useApp.getState().set({ sideTab: "transcript" });
  };

  return (
    <section className="library rail-panel">
      <div className="lib-header">
        <h2>
          <ListChecks size={15} /> Gravação da aula
        </h2>
      </div>
      <div className="prepare">
        <p className="props-hint muted">
          O caminho de quem grava: o roteiro, a voz, a tela sobre a voz e o envio para quem edita.
        </p>
        <ol className="prepare-steps">
          <Step n={1} title="Roteiro" state={state(!!doc, true)}>
            <p className="muted">
              {doc
                ? `${plural(parts, "parte", "partes")}, ${plural(lines, "fala", "falas")}. É dele que o gravador tira as falas e o que fazer na tela.`
                : "Opcional, mas é com ele que o gravador mostra as falas e as instruções Na tela."}
            </p>
            <Button
              size="sm"
              icon={ScrollText}
              onClick={() => useApp.getState().set({ sideTab: "script" })}
            >
              {doc ? "Ver o roteiro" : "Colar o roteiro"}
            </Button>
          </Step>

          <Step n={2} title="Voz" state={state(voiceRead, true)}>
            <p className="muted">
              {!hasVoice
                ? "Traga a voz pronta (feita em outra ferramenta, em uma ou várias partes) ou grave aqui lendo o roteiro."
                : `${span ? clock(span[1] - span[0]) : ""} de voz${voiceAssets.length > 1 ? ` em ${plural(voiceAssets.length, "arquivo", "arquivos")}` : ""}. ${
                    reading.length
                      ? `Transcrevendo${ratio !== undefined ? ` (${Math.round(ratio * 100)}%)` : ""}, para o gravador mostrar as falas.`
                      : voiceRead
                        ? "Transcrita: o gravador acompanha as falas."
                        : noEngine
                          ? "Falta instalar a transcrição para o gravador acompanhar as falas."
                          : failed
                            ? "A transcrição falhou. Tente de novo."
                            : `${read} de ${voiceAssets.length} ${agree(voiceAssets.length, "transcrita", "transcritas")}.`
                  }`}
            </p>
            <div className="row-6">
              <Button
                size="sm"
                icon={FileAudio}
                variant={hasVoice ? "secondary" : "primary"}
                disabled={!!busy}
                onClick={() => void run("voz", importVoiceFiles)}
              >
                {busy === "voz" ? "Importando…" : "Importar voz"}
              </Button>
              <Button size="sm" icon={Mic} onClick={() => void openRecorder({ mode: "voice" })}>
                Gravar a voz
              </Button>
            </div>
            {hasVoice && !voiceRead && !reading.length && (
              <Button
                size="sm"
                icon={noEngine ? Download : Captions}
                disabled={!!busy}
                onClick={() => void run("ler", transcribeNow)}
              >
                {noEngine ? "Instalar a transcrição" : "Transcrever a voz"}
              </Button>
            )}
          </Step>

          <Step n={3} title="Tela sobre a voz" state={state(screenDone, hasVoice)}>
            <p className="muted">
              {!hasVoice
                ? "Com a voz na aula, a tela é gravada ouvindo a voz nos fones, em quantas partes quiser."
                : !coverage || coverage.lines.length === 0
                  ? anyScreen
                    ? `Tela em ${Math.round(((coverage?.covered ?? 0) / (coverage?.total || 1)) * 100)}% da voz.`
                    : "Nenhuma tela gravada ainda."
                  : `Tela em ${coverage.done} de ${plural(coverage.lines.length, "fala", "falas")}.`}
            </p>
            {hasVoice && coverage && coverage.total > 0 && (
              <span className="flow-bar" aria-hidden="true">
                <span
                  style={{ width: `${Math.round((coverage.covered / coverage.total) * 100)}%` }}
                />
              </span>
            )}
            <Button
              size="sm"
              icon={MonitorPlay}
              variant={hasVoice && !screenDone ? "primary" : "secondary"}
              disabled={!hasVoice}
              onClick={() => void openRecorder({ mode: "over" })}
            >
              {anyScreen && !screenDone ? "Continuar de onde parei" : "Gravar a tela"}
            </Button>
            {missing.length > 0 && anyScreen && (
              <ul className="flow-missing">
                {missing.slice(0, 8).map((l) => (
                  <li key={`${l.t}-${l.text}`}>
                    <button type="button" onClick={() => playback.seek(l.t)} title="Ir até a fala">
                      <span className="mono">{clock(l.t)}</span> {l.text}
                    </button>
                  </li>
                ))}
                {missing.length > 8 && (
                  <li className="muted">e mais {plural(missing.length - 8, "fala", "falas")}</li>
                )}
              </ul>
            )}
          </Step>

          <Step n={4} title="Enviar para a edição" state={state(false, hasVoice && anyScreen)}>
            <p className="muted">
              Confere o que falta, empacota a aula com as mídias e salva na pasta de envio.
            </p>
            <Button
              size="sm"
              icon={PackageCheck}
              variant={screenDone ? "primary" : "secondary"}
              disabled={!hasVoice}
              onClick={() => useApp.getState().set({ sendOpen: true })}
            >
              Enviar para a edição
            </Button>
          </Step>
        </ol>
        {notes.length > 0 && (
          <section className="flow-notes" aria-label="Recados da gravação">
            <h4>
              <MessageSquareText size={13} /> Recados da gravação
            </h4>
            <ul className="flow-missing">
              {notes.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => playback.seek(m.t)} title="Ir até o recado">
                    <span className="mono">{clock(m.t)}</span> {m.label.replace(/^Recado: /, "")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
