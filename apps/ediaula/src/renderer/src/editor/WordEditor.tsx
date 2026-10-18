import type { TimelineWord } from "@shared/cleanup";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cleanError } from "@/lib/transcripts";
import { editWord, retimeWord, toggleCaptionBreak } from "@/lib/wordEditing";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";

const failed = (err: unknown): void =>
  useApp.getState().toast(`Não foi possível corrigir a palavra: ${cleanError(err)}`, "error");

/**
 * Inline correction of one transcript word (double click): Enter confirms, Esc cancels. Empty
 * text takes the word out of the text without cutting the video.
 */
export function WordEditor({
  word,
  onClose,
}: {
  word: TimelineWord;
  onClose: () => void;
}): ReactNode {
  const [text, setText] = useState(word.text);
  const [everywhere, setEverywhere] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const course = useProject((s) => s.project?.course ?? "");
  const startsCaption = useProject((s) => !!s.project?.captionBreaks?.includes(word.key));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const confirm = (): void => {
    const typed = text.trim();
    onClose();
    if (typed === word.text && !everywhere && !glossary) return;
    editWord(word, typed ? { text: typed } : { del: true }, {
      everywhere: everywhere && !!typed,
      glossary: glossary && !!typed,
    }).catch(failed);
  };
  const retime = (edge: "start" | "end"): void => {
    retimeWord(word, edge, usePlayback.getState().time).catch(failed);
    input.current?.focus();
  };

  return (
    <fieldset
      className="w-edit"
      aria-label="Corrigir palavra"
      onBlur={(e) => {
        // Leaving the editor (not moving inside it) cancels, like Esc.
        const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
        if (!e.currentTarget.contains(to)) onClose();
      }}
    >
      <input
        ref={input}
        className="w-edit-input"
        value={text}
        size={Math.max(4, text.length + 1)}
        aria-label="Corrigir palavra"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span className="w-edit-pop">
        <label className="w-edit-check">
          <input
            type="checkbox"
            checked={everywhere}
            onChange={(e) => setEverywhere(e.target.checked)}
          />
          Aplicar em todas as ocorrências
        </label>
        <label className="w-edit-check">
          <input
            type="checkbox"
            checked={glossary}
            onChange={(e) => setGlossary(e.target.checked)}
          />
          Adicionar ao glossário {course ? `do curso ${course}` : "dos projetos sem curso"}
        </label>
        <span className="w-edit-row">
          <button type="button" className="chip" onClick={() => retime("start")}>
            Começa aqui
          </button>
          <button type="button" className="chip" onClick={() => retime("end")}>
            Termina aqui
          </button>
          <button
            type="button"
            className={`chip ${startsCaption ? "is-active" : ""}`}
            title="A legenda no vídeo começa uma frase nova nesta palavra"
            onClick={() => {
              toggleCaptionBreak(word.key);
              input.current?.focus();
            }}
          >
            {startsCaption ? "Juntar à legenda anterior" : "Legenda nova aqui"}
          </button>
        </span>
        <span className="w-edit-hint">
          Enter confirma, Esc cancela. "Começa aqui" e "Termina aqui" usam a posição da reprodução.
          Apague o texto para tirar a palavra da transcrição: o vídeo não é cortado.
        </span>
      </span>
    </fieldset>
  );
}
