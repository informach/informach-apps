import type { FontAsset } from "@informach/edi-motion/assets";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  LIBRARY_LICENSE,
  type LibraryFont,
  type LibraryFontPreference,
  weightName,
} from "../../shared/fontLibrary";

/** A choice of the selects: "" (none), "asset:<id>" (the project's) or "library:<id>". */
type Choice = string;

interface Props {
  /** The project's fonts and its defaults. */
  projectFonts: FontAsset[];
  heading: FontAsset | null;
  body: FontAsset | null;
  /** EdiSVG's library and the defaults for new projects (null without the desktop app). */
  library: LibraryFont[];
  preference: LibraryFontPreference | null;
  /** Each returns a message for the person, or throws one. */
  setDefaults(heading: Choice, body: Choice): Promise<string>;
  applyAll(): string;
  setPreference(value: LibraryFontPreference): Promise<string>;
}

const label = (font: { family: string; weight: number; italic?: boolean }) =>
  `${font.family} ${weightName(font.weight)}${font.italic ? " Itálico" : ""}`;

function Options({ projectFonts, library }: Pick<Props, "projectFonts" | "library">) {
  const offered = library.filter(
    (font) =>
      !projectFonts.some(
        (asset) => asset.family === font.family && asset.weight === font.weight && !asset.italic,
      ),
  );
  return (
    <>
      <option value="">Nenhuma (fonte do sistema)</option>
      {projectFonts.length > 0 && (
        <optgroup label="Do projeto">
          {projectFonts.map((font) => (
            <option key={font.id} value={`asset:${font.id}`}>
              {label(font)}
            </option>
          ))}
        </optgroup>
      )}
      {offered.length > 0 && (
        <optgroup label="Do EdiSVG">
          {offered.map((font) => (
            <option key={font.id} value={`library:${font.id}`}>
              {label(font)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

function FontsPanel(props: Props & { close(): void }) {
  const { projectFonts, library, preference } = props;
  const [heading, setHeading] = useState(props.heading ? `asset:${props.heading.id}` : "");
  const [body, setBody] = useState(props.body ? `asset:${props.body.id}` : "");
  const [next, setNext] = useState<LibraryFontPreference | null>(preference);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<string> | string) => {
    setBusy(true);
    setStatus("");
    try {
      setStatus(await task());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível alterar as fontes.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="dialog-heading">
        <h2>Fontes do projeto</h2>
        <button type="button" aria-label="Fechar fontes do projeto" onClick={props.close}>
          ×
        </button>
      </div>
      <div className="help-content fonts-dialog">
        <fieldset disabled={busy}>
          <legend>Fontes padrão deste projeto</legend>
          <p className="micro">
            Um texto novo nasce com a fonte de título. Os botões Título e Corpo do painel de texto
            trocam um texto entre as duas.
          </p>
          <label className="scene-field">
            Título e números
            <select value={heading} onChange={(event) => setHeading(event.target.value)}>
              <Options projectFonts={projectFonts} library={library} />
            </select>
          </label>
          <label className="scene-field">
            Corpo (textos de apoio)
            <select value={body} onChange={(event) => setBody(event.target.value)}>
              <Options projectFonts={projectFonts} library={library} />
            </select>
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => void run(() => props.setDefaults(heading, body))}
          >
            Salvar fontes deste projeto
          </button>
          <button type="button" onClick={() => void run(() => props.applyAll())}>
            Aplicar fontes padrão a todos os textos
          </button>
          <p className="micro">
            Em todas as pranchetas: um texto com peso 600 ou mais (negrito) recebe a fonte de
            título, os outros a de corpo. Textos bloqueados ficam como estão. Ctrl+Z desfaz.
          </p>
        </fieldset>
        {next && (
          <fieldset disabled={busy}>
            <legend>Para projetos novos</legend>
            <label className="scene-field">
              Título e números
              <select
                value={next.heading}
                onChange={(event) => setNext({ ...next, heading: event.target.value })}
              >
                {library.map((font) => (
                  <option key={font.id} value={font.id}>
                    {label(font)}
                  </option>
                ))}
              </select>
            </label>
            <label className="scene-field">
              Corpo (textos de apoio)
              <select
                value={next.body}
                onChange={(event) => setNext({ ...next, body: event.target.value })}
              >
                {library.map((font) => (
                  <option key={font.id} value={font.id}>
                    {label(font)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void run(() => props.setPreference(next))}>
              Salvar para projetos novos
            </button>
          </fieldset>
        )}
        <p role="status" aria-live="polite">
          {status}
        </p>
        <p className="micro">
          As fontes do EdiSVG são arquivos TTF estáticos sob a {LIBRARY_LICENSE}: entram no projeto
          e nas exportações com o aviso da licença (Recursos › aviso da fonte), sem pedir
          confirmação. Cada fonte entra uma vez só no catálogo.
        </p>
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={props.close}>
          Fechar
        </button>
      </div>
    </>
  );
}

/** Opens the dialog. Returns a dispose for a dialog left open. */
export function mountFontsPanel(dialog: HTMLDialogElement, props: Props) {
  dialog.setAttribute("aria-label", "Fontes do projeto");
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
  flushSync(() => root.render(<FontsPanel {...props} close={dispose} />));
  dialog.showModal();
  return dispose;
}
