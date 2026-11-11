import { PenTool } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { linkPicked, refreshLinks, useLinkImport } from "@/lib/edisvgLink";
import { duration as clock } from "@/lib/format";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";

/**
 * The lesson's link with EdiSVG (lib/edisvgLink.ts), kept current: its linked clips are brought
 * up to their renders when the lesson opens, when the window comes back to the front, and when
 * a linked project's renders folder changes (a save in EdiSVG). Also the dialog of "Importar
 * animação do EdiSVG…", which lists the picked project's animations.
 */
export function EdisvgLinks(): ReactNode {
  const projectId = useProject((s) => s.project?.id);
  const pick = useLinkImport((s) => s.pick);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    void refreshLinks();
    const look = () => void refreshLinks();
    window.addEventListener("focus", look);
    const off = window.api.onLinkChanged((project) => void refreshLinks(project));
    return () => {
      window.removeEventListener("focus", look);
      off();
      void window.api.linkWatch([]);
    };
  }, [projectId]);
  useEffect(() => setChosen(pick?.animations[0]?.id ?? null), [pick]);
  if (!pick) return null;
  const close = (): void => useLinkImport.setState({ pick: null });
  return (
    <Modal label="Importar animação do EdiSVG" onClose={close} width={520}>
      <div className="modal-body stack-16">
        <div className="modal-title-row">
          <PenTool size={18} color="var(--accent)" />
          <h2 className="modal-title">Importar animação do EdiSVG</h2>
        </div>
        <p className="muted">
          De {pick.name}. A animação entra no cursor, vinculada: cada salvar no EdiSVG atualiza o
          clipe aqui.
        </p>
        <fieldset className="link-import-list" aria-label="Animações do projeto">
          {pick.animations.map((a) => (
            <label key={a.id}>
              <input
                type="radio"
                name="edisvg-animation"
                checked={chosen === a.id}
                onChange={() => setChosen(a.id)}
              />
              <span>
                {a.name} <span className="muted">· {clock(a.duration)}</span>
                {a.linked ? <span className="muted"> · já vinculada</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <Button onClick={close}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!chosen}
            onClick={() => chosen && void linkPicked(chosen)}
          >
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
