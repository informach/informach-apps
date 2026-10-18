import type { TimelineWord } from "@shared/cleanup";
import type { Word } from "@shared/types";
import { Volume2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { addToGlossary } from "@/lib/glossaryStore";
import { cleanError } from "@/lib/transcripts";
import { bareText, editWord, nudgeWord, playWord, toggleCaptionBreak } from "@/lib/wordEditing";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";

const failed = (err: unknown): void =>
  useApp.getState().toast(`Não foi possível corrigir a palavra: ${cleanError(err)}`, "error");

/** Edges move in steps of this much timeline time. */
const STEP = 0.05;

/**
 * Inline correction of one transcript word (double click, F2 or Enter): Enter or a click outside
 * confirms, Esc cancels. Clicks inside the balloon never close it. Empty text takes the word out
 * of the text without cutting the video.
 */
export function WordEditor({
  word,
  shown,
  occurrences,
  onClose,
}: {
  word: TimelineWord;
  /** The word as the transcript shows it (its times in the media's own seconds). */
  shown: Word | undefined;
  /** How many words of the lesson read like a text. */
  occurrences: (like: string) => number;
  onClose: () => void;
}): ReactNode {
  const [text, setText] = useState(word.text);
  const [everywhere, setEverywhere] = useState(false);
  const [glossary, setGlossary] = useState(false);
  const course = useProject((s) => s.project?.course ?? "");
  const startsCaption = useProject((s) => !!s.project?.captionBreaks?.includes(word.key));
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFieldSetElement>(null);
  const many = occurrences(word.text);

  const confirm = (): void => {
    const typed = text.trim();
    onClose();
    if (typed === word.text && !everywhere && !glossary) return;
    editWord(word, typed ? { text: typed } : { del: true }, {
      everywhere: everywhere && !!typed,
    }).catch(failed);
    const term = bareText(typed);
    // The glossary is kept per course, outside the project: Ctrl+Z does not take a term out.
    if (glossary && term)
      addToGlossary(course, term).catch((err: unknown) =>
        useApp
          .getState()
          .toast(
            `A palavra foi corrigida, mas não entrou no glossário: ${cleanError(err)}`,
            "error",
          ),
      );
  };
  // The latest confirm, for the click-outside listener registered once.
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    // A click anywhere outside the editor confirms what was typed.
    const outside = (e: MouseEvent): void => {
      if (e.target instanceof Node && !box.current?.contains(e.target)) confirmRef.current();
    };
    document.addEventListener("mousedown", outside, true);
    return () => document.removeEventListener("mousedown", outside, true);
  }, []);

  const nudge = (edge: "start" | "end", delta: number): void => {
    if (!shown) return;
    nudgeWord(word, shown, edge, delta).catch((err: unknown) =>
      useApp.getState().toast(cleanError(err), "error"),
    );
  };
  const step = (edge: "start" | "end", delta: number, label: string): ReactNode => (
    <button
      type="button"
      className="chip"
      disabled={!shown}
      aria-label={`${edge === "start" ? "Começo" : "Fim"} ${label}`}
      onClick={() => nudge(edge, delta)}
    >
      {label}
    </button>
  );

  return (
    <fieldset
      className="w-edit"
      ref={box}
      aria-label="Corrigir palavra"
      onMouseDown={(e) => {
        // Clicks in the balloon keep the focus (and the typed text) in the field.
        if (e.target !== input.current) e.preventDefault();
      }}
    >
      <input
        ref={input}
        className="w-edit-input"
        value={text}
        size={Math.max(4, text.length + 1)}
        aria-label="Texto da palavra"
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
          {many > 1
            ? `Aplicar nas ${many} ocorrências de "${word.text}"`
            : "Aplicar em todas as ocorrências"}
        </label>
        <label className="w-edit-check">
          <input
            type="checkbox"
            checked={glossary}
            onChange={(e) => setGlossary(e.target.checked)}
          />
          Adicionar ao glossário {course ? `do curso ${course}` : "dos projetos sem curso"}
        </label>
        {glossary && (
          <span className="w-edit-hint">
            O glossário vale para todas as aulas do curso e não volta com Ctrl+Z.
          </span>
        )}
        <span className="w-edit-row">
          <span className="w-edit-label">Começo</span>
          {step("start", -STEP, "-50 ms")}
          {step("start", STEP, "+50 ms")}
          <span className="w-edit-label">Fim</span>
          {step("end", -STEP, "-50 ms")}
          {step("end", STEP, "+50 ms")}
        </span>
        <span className="w-edit-row">
          <button type="button" className="chip" onClick={() => playWord(word)}>
            <Volume2 size={11} /> Ouvir a palavra
          </button>
          <button
            type="button"
            className={`chip ${startsCaption ? "is-active" : ""}`}
            title="A legenda no vídeo começa uma frase nova nesta palavra"
            onClick={() => toggleCaptionBreak(word.key)}
          >
            {startsCaption ? "Juntar à legenda anterior" : "Legenda nova aqui"}
          </button>
        </span>
        <span className="w-edit-hint">
          Enter ou um clique fora confirma, Esc cancela. Apague o texto para tirar a palavra da
          transcrição: o vídeo não é cortado.
        </span>
      </span>
    </fieldset>
  );
}
