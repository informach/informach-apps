import { languageLabel } from "@shared/captionTranslate";
import { validateChapters } from "@shared/platformPackage";
import { projectDuration } from "@shared/timeline";
import {
  Check,
  CircleHelp,
  Copy,
  Image as ImageIcon,
  Languages,
  ListVideo,
  Loader,
  Plus,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { makeQuiz, platformInput, quizItemTime, translationState } from "@/lib/delivery";
import { addTemplate } from "@/lib/templates";
import { cleanError } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";
import { TranslateDialog } from "./TranslateDialog";

const fmt = (s: number): string => {
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

function CopyButton({ text }: { text: string }): ReactNode {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title="Copiar"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/**
 * The lesson's publishing texts and what goes up to the Sistema Zero platform by hand: the video
 * id, the chapters (and whether they are valid), the quiz, the thumbnail and the translated
 * captions. The export writes all of it in <aula>.plataforma.json beside the video.
 */
export function PlatformCard(): ReactNode {
  const project = useProject((s) => s.project);
  const info = project?.publish ?? {};
  const has = !!(
    info.title ||
    info.description ||
    info.summary ||
    info.chapters?.length ||
    info.quiz?.length
  );
  const [open, setOpen] = useState(has);
  const [busy, setBusy] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translations, setTranslations] = useState<Awaited<ReturnType<typeof translationState>>>(
    [],
  );
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (!project || !open) return;
    let alive = true;
    translationState(project).then(
      (list) => alive && setTranslations(list),
      () => alive && setTranslations([]),
    );
    return () => {
      alive = false;
    };
  }, [project, open]);
  if (!project) return null;
  const input = platformInput(project);
  const duration = projectDuration(project);
  const chapters = info.chapters ?? [];
  const valid = chapters.length ? validateChapters(chapters, duration) : null;
  const description = [
    info.description,
    chapters.length
      ? `Capítulos:\n${chapters.map((c) => `${fmt(c.time)} ${c.title}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const quiz = async (): Promise<void> => {
    setBusy("quiz");
    try {
      const items = await makeQuiz(5);
      toast(`Quiz pronto: ${items.length} perguntas conferidas.`, "success");
    } catch (err) {
      toast(`O quiz não ficou pronto: ${cleanError(err)}`, "error");
    } finally {
      setBusy(null);
    }
  };
  const putQuestion = async (index: number): Promise<void> => {
    const q = info.quiz?.[index];
    if (!q) return;
    setBusy(`q${index}`);
    try {
      const at = await quizItemTime(project, q);
      await addTemplate("question", { question: q.question, options: q.options.join("\n") }, at);
      toast(`Pergunta ${index + 1} na aula${at !== undefined ? ` em ${fmt(at)}` : ""}.`, "success");
    } catch (err) {
      toast(`A pergunta não entrou na aula: ${cleanError(err)}`, "error");
    } finally {
      setBusy(null);
    }
  };
  const thumbnailHere = (): void => {
    const time = usePlayback.getState().time;
    useProject.getState().commit((p) => ({
      ...p,
      publish: {
        ...p.publish,
        thumbnail: { time, ...(p.publish?.title ? { title: p.publish.title } : {}) },
      },
    }));
  };

  return (
    <div className="publish">
      <button type="button" className="publish-head" onClick={() => setOpen(!open)}>
        <ListVideo size={14} className="accent" />
        <strong>Publicação e plataforma</strong>
        <span className="spacer" />
        <span className="muted">{open ? "ocultar" : "mostrar"}</span>
      </button>
      {open && (
        <div className="publish-body">
          {input.videoId && (
            <div className="publish-field">
              <span className="muted">Vídeo na plataforma</span>
              <p className="mono">{input.videoId}</p>
              <CopyButton text={input.videoId} />
            </div>
          )}
          {info.title && (
            <div className="publish-field">
              <span className="muted">Título</span>
              <p>{info.title}</p>
              <CopyButton text={info.title} />
            </div>
          )}
          {description && (
            <div className="publish-field">
              <span className="muted">Descrição e capítulos</span>
              <p className="pre">{description}</p>
              <CopyButton text={description} />
            </div>
          )}
          {chapters.length > 0 && (
            <div className="chapters">
              {chapters.map((c) => (
                <button
                  type="button"
                  key={`${c.time}${c.title}`}
                  className="chapter"
                  onClick={() => playback.seek(c.time)}
                >
                  <span className="mono accent">{fmt(c.time)}</span>
                  {c.title}
                </button>
              ))}
              {valid && !valid.ok && (
                <span className="platform-warn">
                  Os capítulos ficam fora do pacote: {valid.problems.join("; ")}.
                </span>
              )}
            </div>
          )}
          {info.summary && (
            <div className="publish-field">
              <span className="muted">Resumo</span>
              <p className="pre">{info.summary}</p>
              <CopyButton text={info.summary} />
            </div>
          )}

          <div className="platform-section">
            <div className="platform-row">
              <CircleHelp size={13} className="accent" />
              <strong className="spacer">Quiz</strong>
              <Button
                size="sm"
                icon={busy === "quiz" ? Loader : Sparkles}
                disabled={busy !== null}
                title="Feito pela IA a partir das falas da aula; cada pergunta é conferida"
                onClick={() => void quiz()}
              >
                {info.quiz?.length ? "Gerar de novo" : "Gerar quiz"}
              </Button>
            </div>
            {info.quiz?.length ? (
              <ol className="quiz-list">
                {info.quiz.map((q, i) => (
                  <li key={`${q.line}:${q.question}`}>
                    <span>{q.question}</span>
                    <span className="quiz-options">
                      {q.options.map((o, k) => (
                        <span key={o} className={k === q.correct ? "quiz-right" : undefined}>
                          {"ABCD"[k]}) {o}
                        </span>
                      ))}
                    </span>
                    <span className="quiz-foot muted">
                      da fala {q.line}
                      <button
                        type="button"
                        className="link"
                        disabled={busy !== null}
                        title='Põe o template "Pergunta" com esta pergunta depois da fala dela'
                        onClick={() => void putQuestion(i)}
                      >
                        <Plus size={11} /> Pôr na aula
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="muted small">
                Quatro alternativas por pergunta, uma certa, sempre de uma fala da aula.
              </span>
            )}
          </div>

          <div className="platform-section">
            <div className="platform-row">
              <ImageIcon size={13} className="accent" />
              <strong className="spacer">Miniatura</strong>
              <Button size="sm" onClick={thumbnailHere} title="Usa o quadro onde está o cursor">
                Usar o quadro atual
              </Button>
            </div>
            {info.thumbnail ? (
              <span className="muted small">
                Quadro de{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() => playback.seek(info.thumbnail?.time ?? 0)}
                >
                  {fmt(info.thumbnail.time)}
                </button>
                {info.thumbnail.title ? `, título "${info.thumbnail.title}"` : ""}.
              </span>
            ) : (
              <span className="muted small">Sem escolha: sai o quadro de 30% da aula.</span>
            )}
          </div>

          <div className="platform-section">
            <div className="platform-row">
              <Languages size={13} className="accent" />
              <strong className="spacer">Legendas traduzidas</strong>
              <Button size="sm" onClick={() => setTranslating(true)}>
                Traduzir…
              </Button>
            </div>
            {translations.length ? (
              <ul className="translation-list">
                {translations.map((t) => (
                  <li key={t.lang}>
                    <span>{languageLabel(t.lang)}</span>
                    <span className={t.stale ? "platform-warn" : "muted"}>
                      {t.stale
                        ? `${t.stale} de ${t.total} legendas mudaram: traduza de novo`
                        : "em dia, sai com a exportação"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted small">Nenhuma ainda.</span>
            )}
          </div>
          <p className="muted small">
            A exportação grava tudo isso em <span className="mono">aula.plataforma.json</span> ao
            lado do vídeo, com o código de conferência do arquivo. A subida na plataforma é feita
            por você.
          </p>
        </div>
      )}
      {translating && <TranslateDialog close={() => setTranslating(false)} />}
    </div>
  );
}
