import {
  type CopiedProps,
  groupApplies,
  groupIsSet,
  PROP_GROUPS,
  type PropGroup,
  pastableGroups,
} from "@shared/clipProps";
import { ClipboardPaste, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { copiedProps, pasteProps, targetOf } from "@/lib/clipProps";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, IconButton, Modal } from "@/ui";

/** The last choice, per kind of source (annotation or media clip), reused while the app is open. */
let lastPick: { from: "annotation" | "clip"; groups: Set<PropGroup> } | null = null;

/**
 * To start with: the last choice for this kind of source, or what the copied clip changed from the
 * defaults. Copying from an annotation leaves its position out, so the target stays where it is.
 */
function initialPick(src: CopiedProps | null, groups: PropGroup[]): Set<PropGroup> {
  if (!src) return new Set();
  const from = src.clip.annotation ? "annotation" : "clip";
  if (lastPick?.from === from) return new Set(groups.filter((g) => lastPick!.groups.has(g)));
  return new Set(
    groups.filter(
      (g) =>
        groupIsSet(g, src) && !(from === "annotation" && (g === "position" || g === "movement")),
    ),
  );
}

/**
 * Which of the copied properties go onto the selected clips (like Premiere's Paste Attributes).
 * Starts with what the copied clip actually changed from the defaults.
 */
export function PastePropsDialog(): ReactNode {
  const ids = useApp((s) => s.pastePropsClips);
  const project = useProject((s) => s.project);
  const src = copiedProps();
  const close = (): void => {
    useApp.getState().set({ pastePropsClips: null });
  };
  const targets =
    project && ids && src
      ? project.clips
          .filter((c) => ids.includes(c.id) && c.id !== src.clip.id)
          .map((c) => targetOf(project, c))
      : [];
  const groups = src ? pastableGroups(src, targets) : [];
  const [picked, setPicked] = useState<Set<PropGroup>>(() => initialPick(src, groups));
  const [busy, setBusy] = useState(false);
  if (!project || !ids || !src) return null;
  const toggle = (g: PropGroup): void => {
    const next = new Set(picked);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setPicked(next);
  };
  const apply = async (): Promise<void> => {
    lastPick = { from: src.clip.annotation ? "annotation" : "clip", groups: new Set(picked) };
    setBusy(true);
    const n = await pasteProps(ids, picked);
    setBusy(false);
    close();
    if (n)
      useApp
        .getState()
        .toast(
          `Propriedades aplicadas em ${n === 1 ? "1 clipe" : `${n} clipes`}. Ctrl+Z desfaz.`,
          "success",
        );
  };

  return (
    <Modal label="Colar propriedades" onClose={close} width={480}>
      <div className="export-head">
        <ClipboardPaste size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Colar propriedades</h2>
          <p className="muted">
            De {src.name} para{" "}
            {targets.length === 1 ? "o clipe selecionado" : `${targets.length} clipes selecionados`}
            . Marque o que aplicar.
          </p>
        </div>
        <IconButton icon={X} label="Fechar" onClick={close} />
      </div>
      <div className="modal-body paste-props">
        {targets.length === 0 ? (
          <p className="muted">
            Selecione outros clipes (não o próprio clipe copiado) para receber as propriedades.
          </p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nada do que foi copiado serve para estes clipes (por exemplo, volume não vale para
            imagens).
          </p>
        ) : (
          <>
            <div className="row-6">
              <button type="button" className="link-btn" onClick={() => setPicked(new Set(groups))}>
                Marcar tudo
              </button>
              <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>
                Desmarcar tudo
              </button>
            </div>
            <div className="paste-props-list">
              {PROP_GROUPS.filter((g) => groups.includes(g.id)).map((g) => {
                const some = targets.filter((t) => groupApplies(g.id, t)).length;
                return (
                  <label key={g.id} className="paste-prop">
                    <input
                      type="checkbox"
                      checked={picked.has(g.id)}
                      onChange={() => toggle(g.id)}
                    />
                    <span>
                      {g.label}
                      {!groupIsSet(g.id, src) && <span className="muted"> · padrão</span>}
                      {(g.hint || some < targets.length) && (
                        <span className="paste-prop-hint muted">
                          {g.hint}
                          {some < targets.length
                            ? `${g.hint ? "; " : ""}vale para ${some} de ${targets.length}`
                            : ""}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        <div className="modal-actions">
          <Button onClick={close}>Cancelar</Button>
          {targets.length > 0 && groups.length > 0 && (
            <Button variant="primary" disabled={!picked.size || busy} onClick={() => void apply()}>
              Aplicar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
