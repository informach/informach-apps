"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { LerEmVoz } from "@/components/ui/ler-em-voz";
import {
  assessLabAction,
  labToNotebookAction,
  readLabAction,
  saveLabAction,
  startLabAction,
} from "./actions";
import { MathAnswer } from "./math-answer";
import type { LabExecutionView } from "./repository";
import type { LabDocument } from "./schemas";
import { ToolFrame } from "./tool-frame";
import type { ToolAssessment, ToolState } from "./types";
import { useLabDraft } from "./use-lab-draft";

const stages = [
  ["prediction", "Prever"],
  ["investigate", "Experimentar"],
  ["observe", "Observar"],
  ["explain", "Explicar"],
  ["transfer", "Tentar um novo caso"],
] satisfies [LabDocument["stage"], string][];
const inputClass = "mt-2 w-full rounded-controle border-2 border-sombra bg-white p-3 text-tinta";

export function LabRunner({
  initial,
  onReplace,
  onClose,
  closeLabel = "Voltar à biblioteca",
}: {
  initial: LabExecutionView;
  onReplace: (view: LabExecutionView) => void;
  onClose?: (saved: Pick<LabExecutionView, "revision" | "updatedAt">) => void;
  closeLabel?: string;
}) {
  const draft = useLabDraft(initial);
  const region = useRef<HTMLElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  const { document, update } = draft;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [assessment, setAssessment] = useState<ToolAssessment | null>(initial.assessment);
  const [history, setHistory] = useState<ToolState[]>([]);
  const noteRequest = useRef<{ id: string; snapshot: string } | null>(null);
  const [copyId] = useState(() => crypto.randomUUID());
  const [noteSaved, setNoteSaved] = useState(false);
  const transfer = document.stage === "transfer";
  const activity = transfer ? initial.transfer : initial.activity;
  const launch = {
    family: initial.experience.family,
    mode: initial.experience.mode,
    grade: initial.grade,
    variant: transfer ? 1 : 0,
  } satisfies Parameters<typeof ToolFrame>[0]["launch"];
  const state = transfer ? document.transferState : document.state;
  const field = transfer ? "transferState" : "state";
  function edit(patch: Partial<LabDocument>) {
    update({ ...document, ...patch });
    setAssessment(null);
    if (noteSaved) {
      setNoteSaved(false);
      setMessage("");
    }
  }
  function changeState(value: ToolState) {
    setHistory((past) => [...past.slice(-29), state]);
    edit({ [field]: value });
  }
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch {
      setMessage("Não foi possível concluir. Suas mudanças continuam aqui; tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label="Experiência do laboratório"
      aria-busy={busy || draft.recovering}
      className="min-w-0 rounded-card border-2 border-ceu/50 bg-creme p-4 sm:p-6"
    >
      <fieldset disabled={busy || draft.recovering} className="min-w-0 border-0 p-0">
        <legend className="sr-only">Investigar, conferir e guardar</legend>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-tinta-suave">
              {initial.experience.skill} · {initial.experience.toolName}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{activity.title}</h2>
          </div>
          <LerEmVoz
            texto={`${activity.prompt} ${activity.prediction}`}
            rotulo="Ouvir a experiência"
          />
        </div>
        <p className="mt-3 text-tinta">{activity.prompt}</p>
        <div className="my-4 flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={document.free}
              onChange={(event) => edit({ free: event.target.checked })}
            />
            Explorar livremente
          </label>
          <p className="text-sm text-tinta-suave">
            Experimente com calma. O laboratório não dá pontos nem registra autonomia.
          </p>
        </div>
        <nav aria-label="Etapas da investigação" className="mb-5 flex flex-wrap gap-2">
          {stages.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-current={document.stage === id ? "step" : undefined}
              className={`min-h-11 rounded-controle border-2 px-3 py-2 text-sm font-semibold ${document.stage === id ? "border-ceu bg-ceu-claro" : "border-sombra bg-white"}`}
              onClick={() => {
                edit({ stage: id });
                setHistory([]);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {draft.recovery && (
          <div role="status" className="mb-4 rounded-controle border-2 border-sol p-3">
            <p>Há mudanças deste aparelho que ainda não estão na versão aberta.</p>
            <div className="mt-2 flex gap-3">
              <BotaoChapa
                medida="p"
                onClick={() =>
                  action(async () => {
                    if (await draft.restore()) {
                      setAssessment(null);
                      setHistory([]);
                      setNoteSaved(false);
                    }
                  })
                }
              >
                Recuperar rascunho
              </BotaoChapa>
              <BotaoChapa medida="p" tom="contorno" onClick={draft.discardRecovery}>
                Usar versão da conta
              </BotaoChapa>
            </div>
          </div>
        )}
        {document.stage === "prediction" && (
          <div>
            <label htmlFor={`prediction-${initial.id}`} className="font-semibold">
              {activity.prediction}
            </label>
            {initial.grade <= 4 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "Acho que vai aumentar",
                  "Acho que vai diminuir",
                  "Acho que vai ficar igual",
                  "Vou descobrir",
                ].map((choice) => (
                  <BotaoChapa
                    key={choice}
                    medida="p"
                    tom={document.prediction === choice ? "ceu" : "contorno"}
                    onClick={() => edit({ prediction: choice })}
                  >
                    {choice}
                  </BotaoChapa>
                ))}
              </div>
            )}
            <textarea
              id={`prediction-${initial.id}`}
              className={inputClass}
              rows={2}
              maxLength={1000}
              value={document.prediction}
              onChange={(event) => edit({ prediction: event.target.value })}
              placeholder="Você também pode contar sua ideia em voz alta e seguir."
            />
          </div>
        )}
        {(document.free || document.stage !== "prediction") && (
          <div className="mt-4 min-w-0">
            <ToolFrame
              key={`${initial.id}-${launch.variant}`}
              launch={launch}
              state={state}
              onChange={changeState}
              disabled={busy}
              hideResults={transfer && !document.transferHelp}
            />
            {transfer && (
              <div className="mt-3 rounded-controle border-2 border-ceu/40 p-3">
                <p className="text-sm">
                  {document.transferHelp
                    ? "Você abriu o apoio deste caso. Use-o para comparar com seu raciocínio."
                    : "Tente este caso com os dados e a montagem. Os resultados calculados ficam guardados até você pedir apoio."}
                </p>
                {!document.transferHelp && (
                  <BotaoChapa
                    medida="p"
                    tom="contorno"
                    className="mt-2"
                    onClick={() => edit({ transferHelp: true })}
                  >
                    Mostrar apoio neste caso
                  </BotaoChapa>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <BotaoChapa
                medida="p"
                tom="contorno"
                disabled={!history.length || busy}
                onClick={() => {
                  const previous = history.at(-1);
                  if (previous) {
                    edit({ [field]: previous });
                    setHistory((past) => past.slice(0, -1));
                  }
                }}
              >
                Desfazer
              </BotaoChapa>
              <BotaoChapa
                medida="p"
                tom="contorno"
                disabled={busy}
                onClick={() => changeState(activity.initialState)}
              >
                Recomeçar montagem
              </BotaoChapa>
              {!transfer && (
                <BotaoChapa
                  medida="p"
                  tom="contorno"
                  disabled={busy}
                  onClick={() => edit({ comparison: document.state })}
                >
                  Guardar para comparar
                </BotaoChapa>
              )}
            </div>
            {!transfer && document.comparison && (
              <details className="mt-4">
                <summary className="min-h-11 cursor-pointer font-semibold">
                  Comparar com a montagem guardada
                </summary>
                <ToolFrame
                  launch={launch}
                  state={document.comparison}
                  onChange={() => {}}
                  disabled
                />
                <BotaoChapa medida="p" tom="contorno" onClick={() => edit({ comparison: null })}>
                  Remover comparação
                </BotaoChapa>
              </details>
            )}
          </div>
        )}
        {document.stage === "observe" && (
          <div className="mt-4">
            <label htmlFor={`observation-${initial.id}`} className="font-semibold">
              {activity.observation}
            </label>
            <textarea
              id={`observation-${initial.id}`}
              className={inputClass}
              rows={3}
              maxLength={1000}
              value={document.observation}
              onChange={(event) => edit({ observation: event.target.value })}
            />
          </div>
        )}
        {document.stage === "explain" && (
          <div className="mt-4">
            <label htmlFor={`explanation-${initial.id}`} className="font-semibold">
              {activity.explanation}
            </label>
            <textarea
              id={`explanation-${initial.id}`}
              className={inputClass}
              rows={4}
              maxLength={2000}
              value={document.explanation}
              onChange={(event) => edit({ explanation: event.target.value })}
            />
            <fieldset className="mt-3">
              <legend className="font-semibold">Confira sua explicação (autoavaliação)</legend>
              {activity.rubric.map((criterion, index) => (
                <label key={criterion} className="mt-2 flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={document.rubric.includes(index)}
                    onChange={(event) =>
                      edit({
                        rubric: event.target.checked
                          ? [...document.rubric, index]
                          : document.rubric.filter((value) => value !== index),
                      })
                    }
                  />
                  {criterion}
                </label>
              ))}
            </fieldset>
          </div>
        )}
        {(document.stage === "investigate" || transfer) && (
          <div className="mt-5">
            <label htmlFor={`answer-${initial.id}`} className="font-semibold">
              {activity.answerLabel}
            </label>
            {activity.choices ? (
              <select
                id={`answer-${initial.id}`}
                className={inputClass}
                value={transfer ? document.transferAnswer : document.answer}
                onChange={(event) =>
                  edit({ [transfer ? "transferAnswer" : "answer"]: event.target.value })
                }
              >
                <option value="">Escolha sua resposta</option>
                {activity.choices.map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </select>
            ) : (
              <MathAnswer
                id={`answer-${initial.id}`}
                className={inputClass}
                value={transfer ? document.transferAnswer : document.answer}
                onChange={(value) => edit({ [transfer ? "transferAnswer" : "answer"]: value })}
                hintId={`answer-hint-${initial.id}`}
                keys={activity.answerKeys}
              />
            )}
            <p id={`answer-hint-${initial.id}`} className="mt-2 text-sm text-tinta-suave">
              {activity.answerHint ??
                "Use palavras, decimal com vírgula ou fração, conforme a pergunta. A unidade indicada no campo já faz parte da resposta."}
            </p>
            <BotaoChapa
              className="mt-3"
              disabled={busy || draft.conflict}
              onClick={() =>
                action(async () => {
                  if (!(await draft.flush())) return;
                  const result = await assessLabAction({
                    profileId: initial.profileId,
                    id: initial.id,
                    revision: draft.getRevision(),
                    variant: launch.variant,
                  });
                  if (result.ok) {
                    const { updatedAt, ...assessment } = result.data;
                    draft.confirmAssessmentDate(updatedAt);
                    setAssessment(assessment);
                    setNoteSaved(false);
                  } else setMessage(result.error);
                })
              }
            >
              Conferir a investigação
            </BotaoChapa>
            {assessment && (
              <p role="status" className="mt-3 rounded-controle border-2 border-ceu p-3">
                {assessment.correct === null
                  ? "Para refletir: "
                  : assessment.correct
                    ? "Sua ideia confere. "
                    : "Vamos rever. "}
                {assessment.message}
              </p>
            )}
          </div>
        )}
        <div className="mt-6 border-t-2 border-sombra pt-4">
          <p role="status" className="text-sm font-semibold">
            {draft.status}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <BotaoChapa
              medida="p"
              tom="contorno"
              disabled={busy || draft.conflict}
              onClick={() =>
                action(async () => {
                  await draft.flush();
                })
              }
            >
              Salvar agora
            </BotaoChapa>
            {document.stage !== "transfer" && (
              <BotaoChapa
                medida="p"
                disabled={busy}
                onClick={() => {
                  const next = stages[stages.findIndex(([id]) => id === document.stage) + 1];
                  if (next) {
                    edit({ stage: next[0] });
                    setHistory([]);
                  }
                }}
              >
                Próxima etapa
              </BotaoChapa>
            )}
            <BotaoChapa
              medida="p"
              disabled={busy || draft.conflict || noteSaved}
              onClick={() =>
                action(async () => {
                  if (!(await draft.flush())) return;
                  const revision = draft.getRevision();
                  const snapshot = JSON.stringify({ document, assessment, revision });
                  if (noteRequest.current?.snapshot !== snapshot)
                    noteRequest.current = { id: crypto.randomUUID(), snapshot };
                  const result = await labToNotebookAction({
                    profileId: initial.profileId,
                    id: initial.id,
                    noteId: noteRequest.current.id,
                    revision,
                  });
                  if (result.ok) {
                    setNoteSaved(true);
                    setMessage("Cópia desta investigação guardada no caderno.");
                  } else setMessage(result.error);
                })
              }
            >
              Guardar no caderno
            </BotaoChapa>
            <BotaoChapa
              medida="p"
              tom="contorno"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const result = await startLabAction({
                    profileId: initial.profileId,
                    id: copyId,
                    experienceId: initial.experience.id,
                    duplicateId: initial.id,
                  });
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  const saved = await saveLabAction({
                    profileId: initial.profileId,
                    id: result.data.id,
                    revision: result.data.revision,
                    document,
                  });
                  if (!saved.ok) {
                    setMessage(saved.error);
                    return;
                  }
                  const opened = await readLabAction({
                    profileId: initial.profileId,
                    id: result.data.id,
                  });
                  if (opened.ok) onReplace(opened.data);
                  else setMessage(opened.error);
                })
              }
            >
              Guardar em uma cópia
            </BotaoChapa>
            {draft.conflict && (
              <BotaoChapa
                medida="p"
                tom="contorno"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const result = await readLabAction({
                      profileId: initial.profileId,
                      id: initial.id,
                    });
                    if (result.ok) onReplace(result.data);
                    else setMessage(result.error);
                  })
                }
              >
                Reabrir versão da conta
              </BotaoChapa>
            )}
            {onClose && (
              <BotaoChapa
                medida="p"
                tom="contorno"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    if (await draft.flush()) onClose(draft.getSavedVersion());
                  })
                }
              >
                {closeLabel}
              </BotaoChapa>
            )}
          </div>
          <p role="status" className="mt-3 text-sm">
            {message}
          </p>
          {noteSaved && (
            <Link href="/caderno" className="mt-2 inline-block underline">
              Abrir meu caderno
            </Link>
          )}
          {initial.context && (
            <Link className="mt-3 block underline" href={`/missao/${initial.context.sessionId}`}>
              Retomar a missão de origem
            </Link>
          )}
        </div>
      </fieldset>
    </section>
  );
}
