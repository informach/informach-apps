import {
  PREPARE_HINT,
  PREPARE_LABEL,
  PREPARE_STEPS,
  type PrepareStep,
  resumeStep,
} from "@shared/prepare";
import { sectionLabel } from "@shared/script";
import {
  Check,
  CircleDashed,
  ListChecks,
  Loader,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { applyTemplateParts, dismissCourseOffer, useCourseOffer } from "@/lib/courseTemplate";
import {
  confirmPrepareSection,
  openPrepare,
  redoPrepareStep,
  runPrepare,
  skipPrepareStep,
  usePrepare,
} from "@/lib/prepare";
import { scriptDoc, useScriptView } from "@/lib/script";
import { useTranscripts } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { draftCommit, useProject } from "@/state/project";
import { Button, IconButton } from "@/ui";
import { PreflightList } from "./PreflightList";

/**
 * "Preparar aula" in the side panel (opened from the top bar, the offer after a take or the AI):
 * the ten steps, where the lesson stands and what is waiting.
 */
export function PreparePanel(): ReactNode {
  const project = useProject((s) => s.project);
  const { running, waiting, message, findings } = usePrepare();
  if (!project) return null;
  const state = project.prepare;
  const current = state ? resumeStep(state) : null;
  const started = !!state;
  const doc = scriptDoc(project);
  const status = (step: PrepareStep): "done" | "skipped" | "current" | "todo" =>
    state?.decisions[step] ?? (step === current ? "current" : "todo");

  return (
    <div className="prepare">
      <div className="prepare-head">
        <Wand2 size={16} className="accent" />
        <div className="spacer">
          <strong>Preparar aula</strong>
          <p className="muted">
            Dez etapas em ordem. Cada uma vira uma proposta ou um rascunho para você aprovar na
            barra de revisão; nada muda na aula sem a sua aprovação.
          </p>
        </div>
        <IconButton
          icon={X}
          label="Fechar Preparar aula"
          onClick={() => useApp.getState().set({ sideTab: "transcript" })}
        />
      </div>
      {!started && (
        <Button variant="primary" icon={Play} onClick={openPrepare}>
          Começar a preparar
        </Button>
      )}
      {started && !current && (
        <p className="prepare-done">
          <Check size={14} className="accent" /> A aula está preparada. Confira a verificação e
          exporte.
        </p>
      )}
      <ol className="prepare-steps">
        {PREPARE_STEPS.map((step, i) => {
          const s = status(step);
          const note = state?.notes?.[step];
          const isRunning = running === step;
          return (
            <li
              key={step}
              className={`prepare-step is-${s}`}
              aria-current={s === "current" ? "step" : undefined}
            >
              <span className="prepare-mark">
                {isRunning ? (
                  <Loader size={13} className="spin" />
                ) : s === "done" ? (
                  <Check size={13} />
                ) : s === "skipped" ? (
                  <SkipForward size={13} />
                ) : (
                  <CircleDashed size={13} />
                )}
              </span>
              <div className="prepare-body">
                <div className="prepare-title">
                  <span className="mono muted">{i + 1}</span> {PREPARE_LABEL[step]}
                  {(s === "done" || s === "skipped") && (
                    <button
                      type="button"
                      className="link prepare-redo"
                      onClick={() => redoPrepareStep(step)}
                      title="Fazer de novo esta etapa e as seguintes"
                    >
                      <RotateCcw size={11} /> Refazer
                    </button>
                  )}
                </div>
                {s === "current" ? (
                  <>
                    <p className="muted">{PREPARE_HINT[step]}</p>
                    {isRunning && <p className="prepare-note">Trabalhando nesta etapa…</p>}
                    {!isRunning && message && <p className="prepare-note">{message}</p>}
                    {step === "section" && !isRunning && doc && <SectionChoice />}
                    {!isRunning && (
                      <div className="row-6">
                        {waiting ? (
                          <span className="muted">
                            <Sparkles size={12} /> Revise{" "}
                            {waiting.what === "draft" ? "o rascunho" : "a proposta"} na barra acima
                            da timeline: aplicar conclui a etapa, descartar pula.
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={Play}
                            onClick={() => void runPrepare()}
                          >
                            {message ? "Tentar de novo" : "Fazer esta etapa"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={SkipForward}
                          onClick={skipPrepareStep}
                        >
                          Pular
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  note && <p className="muted prepare-note">{note}</p>
                )}
                {step === "check" && findings && s === "done" && (
                  <PreflightList findings={findings} onFixed={() => redoPrepareStep("check")} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Step 2: the section the recording seems to be, or any other, confirmed by the person. */
function SectionChoice(): ReactNode {
  const project = useProject((s) => s.project);
  const view = useScriptView(project, useTranscripts(project));
  const doc = scriptDoc(project);
  if (!project || !doc) return null;
  const guess = view?.index ?? 0;
  return (
    <div className="prepare-sections">
      <select
        className="select"
        aria-label="Seção desta gravação"
        defaultValue={guess}
        onChange={(e) => confirmPrepareSection(Number(e.target.value))}
      >
        {doc.sections.map((s, i) => (
          <option key={`${s.number}:${s.title}`} value={i}>
            {sectionLabel(s)}
          </option>
        ))}
      </select>
      <Button size="sm" icon={Check} onClick={() => confirmPrepareSection(guess)}>
        Confirmar a seção {doc.sections[guess]?.number}
      </Button>
    </div>
  );
}

/**
 * Above the review bar: "Preparar aula" offered after a take came in, and the course template
 * offered when a lesson of a course with a saved template opens.
 */
export function PrepareOffer(): ReactNode {
  const offer = usePrepare((s) => s.offer);
  const projectId = useProject((s) => s.project?.id);
  const course = useCourseOffer();
  const showCourse = !!course.template && course.projectId === projectId;
  if (!offer && !showCourse) return null;
  return (
    <>
      {offer && (
        <section className="prepare-offer" aria-label="Preparar aula">
          <ListChecks size={15} className="accent" />
          <span className="spacer">
            <strong>A gravação entrou na aula.</strong> Quer preparar agora? Transcrição, cortes,
            inserções, zoom, anotações, legenda e cartelas, cada um para você aprovar.
          </span>
          <Button size="sm" variant="primary" icon={Wand2} onClick={openPrepare}>
            Preparar aula
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={X}
            onClick={() => usePrepare.setState({ offer: false })}
          >
            Agora não
          </Button>
        </section>
      )}
      {showCourse && course.template && (
        <section className="prepare-offer" aria-label="Modelo do curso">
          <Wand2 size={15} className="accent" />
          <span className="spacer">
            <strong>Este curso tem um modelo salvo.</strong> Aplicar paleta, legenda, cartelas,
            posição do apresentador, cursor, zoom, música e anotações como rascunho?
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              const template = course.template;
              const waiting = useProject.getState().draft;
              if (waiting && waiting.projectId === projectId) {
                useApp
                  .getState()
                  .toast(
                    `Há um rascunho esperando revisão ("${waiting.title}"). Aplique ou descarte antes.`,
                    "error",
                  );
                return;
              }
              dismissCourseOffer();
              if (!template) return;
              void applyTemplateParts(
                template,
                ["look", "zoom", "annotations", "captions", "cards"],
                draftCommit("modelo", "Modelo do curso", projectId),
              ).then((done) =>
                useApp
                  .getState()
                  .toast(
                    done.length && useProject.getState().draft?.author === "modelo"
                      ? `Rascunho do modelo do curso pronto: ${done.join(", ")}. Revise na barra acima da timeline.`
                      : "A aula já segue o modelo do curso.",
                    "info",
                  ),
              );
            }}
          >
            Aplicar como rascunho
          </Button>
          <Button size="sm" variant="ghost" icon={X} onClick={dismissCourseOffer}>
            Agora não
          </Button>
        </section>
      )}
    </>
  );
}
