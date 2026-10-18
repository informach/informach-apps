import {
  CAPTION_LINE,
  CAPTION_LINES,
  languageLabel,
  TRANSLATION_BATCH,
  TRANSLATION_LANGUAGES,
} from "@shared/captionTranslate";
import { ENGINE_LABEL } from "@shared/types";
import { Languages, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { lessonCues, translateLesson } from "@/lib/delivery";
import { cleanError } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, Field, IconButton, Modal, Progress } from "@/ui";

/**
 * "Traduzir as legendas": the captions of the lesson as the export makes them, translated by the
 * AI engine set up in Configurações (the person's key, Claude Code or Codex), batch by batch,
 * each answer checked before it is kept. The files go out with the export.
 */
export function TranslateDialog({ close }: { close: () => void }): ReactNode {
  const project = useProject((s) => s.project);
  const [lang, setLang] = useState<string>("en");
  const [count, setCount] = useState<number | null>(null);
  const [engine, setEngine] = useState("");
  const [state, setState] = useState<
    | { kind: "setup" }
    | { kind: "running"; done: number; total: number }
    | { kind: "done"; count: number }
    | { kind: "error"; message: string }
  >({ kind: "setup" });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    void lessonCues(project).then(
      (cues) => alive && setCount(cues.length),
      () => alive && setCount(0),
    );
    void window.api.aiSettings().then((s) => alive && setEngine(ENGINE_LABEL[s.engine]));
    return () => {
      alive = false;
    };
  }, [project]);
  useEffect(() => () => stop.current?.abort(), []);
  if (!project) return null;
  const existing = project.captionTranslations?.find((t) => t.lang === lang);
  const batches = count ? Math.ceil(count / TRANSLATION_BATCH) : 0;

  const run = async (): Promise<void> => {
    const cancel = new AbortController();
    stop.current = cancel;
    setState({ kind: "running", done: 0, total: batches });
    try {
      const r = await translateLesson(lang, {
        signal: cancel.signal,
        progress: (done, total) => setState({ kind: "running", done, total }),
      });
      setState({ kind: "done", count: r.count });
      useApp.getState().toast(`Legendas em ${languageLabel(lang)} prontas.`, "success");
    } catch (err) {
      setState(
        cancel.signal.aborted ? { kind: "setup" } : { kind: "error", message: cleanError(err) },
      );
    } finally {
      stop.current = null;
    }
  };

  return (
    <Modal
      label="Traduzir as legendas"
      onClose={() => state.kind !== "running" && close()}
      width={520}
    >
      <div className="export-head">
        <Languages size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Traduzir as legendas</h2>
          <p className="muted">
            {count === null
              ? "Contando as legendas…"
              : count
                ? `${count} legendas da aula como ela está agora`
                : "A aula ainda não tem legendas: transcreva a narração primeiro."}
          </p>
        </div>
        {state.kind !== "running" && <IconButton icon={X} label="Fechar" onClick={close} />}
      </div>
      <div className="translate-body">
        <Field label="Idioma">
          <select
            className="select"
            value={lang}
            disabled={state.kind === "running"}
            onChange={(e) => {
              setLang(e.target.value);
              setState({ kind: "setup" });
            }}
          >
            {TRANSLATION_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted small">
          Traduzido por {engine || "o motor de IA configurado"}, {TRANSLATION_BATCH} legendas por
          vez{batches > 1 ? ` (${batches} lotes)` : ""}. Cada resposta é conferida: a mesma
          quantidade de legendas e no máximo {CAPTION_LINES} linhas de {CAPTION_LINE} caracteres. Os
          arquivos <span className="mono">aula.{lang}.srt</span> e{" "}
          <span className="mono">.vtt</span> saem ao lado do vídeo na exportação.
        </p>
        {existing && state.kind === "setup" && (
          <p className="muted small">
            Já existe uma tradução para {languageLabel(lang)}; traduzir de novo substitui.
          </p>
        )}
        {state.kind === "running" && (
          <div className="translate-progress" role="status">
            <span>
              {state.done
                ? `Lote ${state.done} de ${state.total} traduzido e conferido`
                : "Traduzindo o primeiro lote…"}
            </span>
            <Progress ratio={state.total ? state.done / state.total : 0} />
          </div>
        )}
        {state.kind === "done" && (
          <p className="accent" role="status">
            {state.count} legendas em {languageLabel(lang)} guardadas na aula.
          </p>
        )}
        {state.kind === "error" && (
          <p className="platform-warn" role="alert">
            {state.message}
          </p>
        )}
      </div>
      <div className="export-foot">
        <span className="spacer" />
        {state.kind === "running" ? (
          <Button variant="ghost" onClick={() => stop.current?.abort()}>
            Parar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {state.kind === "done" ? "Fechar" : "Cancelar"}
            </Button>
            {state.kind !== "done" && (
              <Button
                variant="primary"
                icon={Languages}
                disabled={!count}
                onClick={() => void run()}
              >
                {existing ? "Traduzir de novo" : "Traduzir"}
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
