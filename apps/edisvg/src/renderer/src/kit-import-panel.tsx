import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { KitGroup, NamedColor } from "./designKitImport";

/**
 * The folders of a design kit to import. A project holds 100 artboards, and every SVG and PNG of
 * the kit is one: the dialog says how many still fit and opens with the folders that fit
 * checked (designKitImport.ts defaultFolders).
 */

interface Props {
  name: string;
  groups: KitGroup[];
  chosen: Set<string>;
  room: number;
  palette: NamedColor[];
  sheet: string | null;
  fonts: string[];
  missingFonts: string[];
  apply(folders: Set<string>): void;
}

const folderName = (folder: string) => folder || "Na raiz do kit";

function KitPanel({
  name,
  groups,
  chosen,
  room,
  palette,
  sheet,
  fonts,
  missingFonts,
  apply,
  cancel,
}: Props & { cancel(): void }) {
  const [folders, setFolders] = useState(chosen);
  const total = groups.filter((g) => folders.has(g.folder)).reduce((sum, g) => sum + g.count, 0);
  const over = total > room;
  return (
    <>
      <div className="dialog-heading">
        <h2>Importar kit de design</h2>
        <button type="button" aria-label="Fechar importação do kit" onClick={cancel}>
          ×
        </button>
      </div>
      <div className="help-content">
        <p>
          Cada SVG e cada PNG de <strong>{name}</strong> vira uma prancheta "Kit · pasta · arquivo",
          para usar como componente. A arte e as animações do projeto ficam como estão.
        </p>
        <fieldset className="kit-folders">
          <legend>Pastas do kit</legend>
          {groups.map((group) => (
            <label key={group.folder}>
              <input
                type="checkbox"
                name="kit-folder"
                value={group.folder}
                checked={folders.has(group.folder)}
                onChange={(event) => {
                  const next = new Set(folders);
                  if (event.target.checked) next.add(group.folder);
                  else next.delete(group.folder);
                  setFolders(next);
                }}
              />
              <span>
                <strong>{folderName(group.folder)}</strong> · {group.count}{" "}
                {group.count === 1 ? "prancheta" : "pranchetas"}
                <small>
                  {group.sample.join(", ")}
                  {group.count > group.sample.length ? ", …" : ""}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <p role="status" className={over ? "kit-over" : undefined}>
          {total} {total === 1 ? "prancheta escolhida" : "pranchetas escolhidas"}; cabem {room}{" "}
          neste projeto (um projeto tem até 100).
          {over ? " Desmarque pastas, ou importe o resto em outro projeto." : ""}
        </p>
        {palette.length > 0 && (
          <div className="kit-palette">
            <span>
              Paleta: {palette.length} cores{sheet ? ` de ${sheet}` : " mais usadas no kit"}
            </span>
            <span className="kit-swatches" aria-hidden="true">
              {palette.map((c) => (
                <i key={c.color} title={`${c.name} ${c.color}`} style={{ background: c.color }} />
              ))}
            </span>
          </div>
        )}
        {fonts.length > 0 && (
          <p className="micro">
            Fontes que o kit usa e o EdiSVG tem: {fonts.join(", ")}. Entram no projeto com o aviso
            de licença (SIL Open Font License 1.1), e os textos do kit passam a usá-las.
          </p>
        )}
        {missingFonts.length > 0 && (
          <p className="micro">
            O EdiSVG não tem {missingFonts.join(", ")}: esses textos usam a fonte do sistema.
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={cancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          disabled={over || total === 0}
          onClick={() => apply(folders)}
        >
          Importar {total} {total === 1 ? "prancheta" : "pranchetas"}
        </button>
      </div>
    </>
  );
}

/** Opens the dialog; `apply` runs after it closes. Returns a dispose for a dialog left open. */
export function mountKitImport(dialog: HTMLDialogElement, props: Props) {
  dialog.setAttribute("aria-label", "Importar kit de design");
  dialog.classList.add("kit-dialog");
  let live = true;
  const root = createRoot(dialog);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeAttribute("aria-label");
    dialog.classList.remove("kit-dialog");
    dialog.removeEventListener("cancel", cancelEvent);
    root.unmount();
    dialog.close();
  };
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    dispose();
  };
  dialog.addEventListener("cancel", cancelEvent);
  flushSync(() =>
    root.render(
      <KitPanel
        {...props}
        cancel={dispose}
        apply={(folders) => {
          dispose();
          props.apply(folders);
        }}
      />,
    ),
  );
  dialog.showModal();
  return dispose;
}
