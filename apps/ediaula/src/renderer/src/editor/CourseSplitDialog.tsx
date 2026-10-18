import { type SectionRange, splitBySections } from "@shared/courseSplit";
import { projectDuration } from "@shared/timeline";
import { Layers, Loader, SquareSplitHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { produceAll } from "@/lib/courseBatch";
import { projectCorrectionTerms } from "@/lib/glossaryStore";
import { currentView } from "@/lib/script";
import { cleanError } from "@/lib/transcripts";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button, IconButton, Modal } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * "Dividir por seção": where each section of the script is in this long recording, as stretches
 * the person reviews (and leaves out), then "Produzir todas" makes one lesson per stretch with
 * the same media; each waits in the batch bar for its approval and then the export queue.
 */
export function CourseSplitDialog({ close }: { close: () => void }): ReactNode {
  const project = useProject((s) => s.project);
  // The split is worked out once, on the lesson as it was when the dialog opened.
  const [opened] = useState(() => useProject.getState().project);
  const [ranges, setRanges] = useState<SectionRange[] | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    void (async () => {
      try {
        const view = await currentView(opened);
        if (!view) throw new Error("Esta aula não tem roteiro.");
        if (!view.words.length) throw new Error("Transcreva a gravação para achar as seções.");
        const glossary = await projectCorrectionTerms(opened);
        const found = splitBySections(view.doc, view.words, {
          glossary,
          duration: projectDuration(opened),
        });
        if (alive) setRanges(found);
      } catch (err) {
        if (alive) setError(cleanError(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [opened]);
  if (!project) return null;
  const chosen = (ranges ?? []).filter((r) => !off.has(r.section));

  const produce = async (): Promise<void> => {
    const view = await currentView(project);
    if (!view || !chosen.length) return;
    setBusy(true);
    try {
      const n = await produceAll(project, view.doc, chosen);
      useApp
        .getState()
        .toast(
          `${n === 1 ? "1 aula criada" : `${n} aulas criadas`}. Abra cada uma pela barra do lote, prepare e aprove.`,
          "success",
        );
      close();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Dividir por seção" onClose={() => !busy && close()} width={620}>
      <div className="export-head">
        <SquareSplitHorizontal size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Dividir a gravação por seção</h2>
          <p className="muted">
            Cada seção do roteiro achada nesta gravação vira uma aula, com as mesmas mídias.
          </p>
        </div>
        {!busy && <IconButton icon={X} label="Fechar" onClick={close} />}
      </div>
      <div className="split-body">
        {error ? (
          <p className="platform-warn">{error}</p>
        ) : !ranges ? (
          <p className="muted">
            <Loader size={13} className="spin" /> Procurando as seções na gravação…
          </p>
        ) : !ranges.length ? (
          <p className="muted">
            Não achei mais de uma seção do roteiro nesta gravação. Confira se o roteiro é o desta
            gravação.
          </p>
        ) : (
          <ul className="split-list">
            {ranges.map((r) => (
              <li key={r.section} className={off.has(r.section) ? "is-off" : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={!off.has(r.section)}
                    onChange={() =>
                      setOff((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.section)) next.delete(r.section);
                        else next.add(r.section);
                        return next;
                      })
                    }
                  />
                  <span className="split-label">{r.label}</span>
                </label>
                <button
                  type="button"
                  className="link mono"
                  title="Leva o cursor ao começo deste trecho"
                  onClick={() => playback.seek(r.start)}
                >
                  {clock(r.start)} a {clock(r.end)}
                </button>
                <span className="muted small">{Math.round(r.coverage * 100)}% das falas</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="export-foot">
        <span className="muted small spacer">
          A gravação original não muda. As aulas novas ficam na pasta de projetos.
        </span>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={busy ? Loader : Layers}
          disabled={busy || chosen.length < 1}
          onClick={() => void produce()}
        >
          {busy ? "Criando…" : `Produzir todas (${chosen.length})`}
        </Button>
      </div>
    </Modal>
  );
}
