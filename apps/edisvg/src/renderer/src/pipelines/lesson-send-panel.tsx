import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Project } from "../../../shared/project";
import { type LessonSendBridge, type SendItem, sendLesson, sendPlan } from "./lessonSend";
import { clock } from "./runner";

/**
 * The animations of each lesson made by the pipelines, and the button that sends them to EdiAula
 * (lessonSend.ts). While it sends, it says which animation and frame; Cancelar stops it.
 */

const KIND: Record<SendItem["stretch"]["kind"], string> = {
  "game-scene": "Tela inteira",
  "screen-demo": "Sobre a tela (transparente)",
};

interface Props {
  project: Project;
  bridge: LessonSendBridge;
  report(message: string): void;
  setBusy(busy: boolean): void;
}

function SendPanel({ project, bridge, report, setBusy, close }: Props & { close(): void }) {
  const plan = [...sendPlan(project).entries()];
  const [lessonId, setLessonId] = useState(plan[0]?.[0] ?? "");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const control = useRef<AbortController | null>(null);
  const items = plan.find(([id]) => id === lessonId)?.[1] ?? [];
  const send = async () => {
    const abort = new AbortController();
    control.current = abort;
    setSending(true);
    setBusy(true);
    setDone(false);
    try {
      const count = await sendLesson(
        project,
        lessonId,
        bridge,
        (index, frame, item) => {
          if (frame === 1 || frame % 15 === 0 || frame === item.frames)
            setStatus(
              `Enviando ${index + 1} de ${items.length}: ${item.name} · quadro ${frame} de ${item.frames}`,
            );
        },
        abort.signal,
      );
      setStatus(
        `${count === 1 ? "1 animação enviada" : `${count} animações enviadas`}. No EdiAula, abra esta aula (ou volte para a janela dela): ela oferece colocar as animações na faixa acima da gravação de tela.`,
      );
      setDone(true);
    } catch (error) {
      const message = abort.signal.aborted
        ? "Envio cancelado: nada desta vez ficou pela metade."
        : error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
          : "Não foi possível enviar.";
      setStatus(message);
      report(message);
    } finally {
      control.current = null;
      setSending(false);
      setBusy(false);
    }
  };
  return (
    <>
      <div className="dialog-heading">
        <h2>Enviar animações para a aula</h2>
        <button
          type="button"
          aria-label="Fechar envio para a aula"
          disabled={sending}
          onClick={close}
        >
          ×
        </button>
      </div>
      <div className="help-content">
        {plan.length === 0 ? (
          <p>
            Nenhuma animação deste projeto veio de uma aula do EdiAula. Rode um pipeline com o
            pacote da aula: cada animação guarda o trecho da aula dela e pode ser enviada.
          </p>
        ) : (
          <>
            <p>
              Cada animação vai para o EdiAula no segundo do trecho dela: a de tela inteira em MP4,
              a demonstração em WebM transparente, por cima da gravação de tela.
            </p>
            {plan.length > 1 && (
              <label className="scene-field">
                Aula
                <select
                  value={lessonId}
                  disabled={sending}
                  onChange={(event) => setLessonId(event.target.value)}
                >
                  {plan.map(([id, lesson]) => (
                    <option key={id} value={id}>
                      {id} · {lesson.length} {lesson.length === 1 ? "animação" : "animações"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ol className="lesson-send-items">
              {items.map((item) => (
                <li key={item.stretch.clipId}>
                  <strong>
                    {clock(item.stretch.start)}–{clock(item.stretch.start + item.frames / item.fps)}
                  </strong>{" "}
                  · {KIND[item.stretch.kind]} · {item.name}
                  <small>
                    {item.artboardName} · {item.width}×{item.height} · {item.frames} quadros
                  </small>
                </li>
              ))}
            </ol>
          </>
        )}
        {status && (
          <p role="status" className="lesson-send-status">
            {status}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        {sending ? (
          <button type="button" onClick={() => control.current?.abort()}>
            Cancelar
          </button>
        ) : (
          <button type="button" onClick={close}>
            {done ? "Fechar" : "Cancelar"}
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={sending || !items.length}
          onClick={() => void send()}
        >
          {done ? "Enviar de novo" : "Enviar para o EdiAula"}
        </button>
      </div>
    </>
  );
}

export function mountLessonSend(dialog: HTMLDialogElement, props: Props) {
  dialog.setAttribute("aria-label", "Enviar animações para a aula");
  let live = true;
  let busy = false;
  const root = createRoot(dialog);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeAttribute("aria-label");
    dialog.removeEventListener("cancel", cancelEvent);
    root.unmount();
    dialog.close();
  };
  // Escape while sending would leave the frames half sent: the dialog waits for Cancelar.
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    if (!busy) dispose();
  };
  dialog.addEventListener("cancel", cancelEvent);
  flushSync(() =>
    root.render(
      <SendPanel
        {...props}
        setBusy={(value) => {
          busy = value;
          props.setBusy(value);
        }}
        close={dispose}
      />,
    ),
  );
  dialog.showModal();
  return dispose;
}
