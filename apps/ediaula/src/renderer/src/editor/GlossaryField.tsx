import { type ReactNode, useState } from "react";
import { saveGlossary, useCourseGlossary } from "@/lib/glossaryStore";
import { cleanError } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";

/**
 * The course glossary: names and terms the transcription has to get right. Saved when the field
 * loses focus; the transcripts are corrected again right away, without transcribing anything.
 */
export function GlossaryField({ disabled, hint }: { disabled?: boolean; hint: string }): ReactNode {
  const course = useProject((s) => s.project?.course ?? "");
  const saved = useCourseGlossary(course);
  // What the user is typing; null while the field shows the saved glossary.
  const [draft, setDraft] = useState<string | null>(null);
  const save = (): void => {
    if (draft === null) return;
    saveGlossary(course, draft.split(/[,\n;]/))
      .then(() => setDraft(null))
      .catch((err: unknown) =>
        useApp.getState().toast(`Não foi possível salvar o glossário: ${cleanError(err)}`, "error"),
      );
  };
  return (
    <label className="field">
      <span className="field-label">
        Glossário {course ? `do curso ${course}` : "(projetos sem curso)"}
      </span>
      <textarea
        className="input glossary"
        rows={2}
        value={draft ?? saved.join(", ")}
        disabled={disabled}
        placeholder="Nomes e termos que a transcrição deve acertar. Ex.: Debinha, Zappy, bloco Quando clicar"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
      <span className="field-hint">
        {hint} Até 60 termos. O glossário fica guardado por curso e não volta com Ctrl+Z.
      </span>
    </label>
  );
}
