import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Scene } from "../../shared/sceneTypes";
import { readSvgFile } from "./svg-import-input";
import { inspectSvgImport } from "./svgImport.js";

interface Source {
  source: string;
  name: string;
}
interface Props {
  initial?: Source;
  native?: () => Promise<string | null>;
  apply(scene: Scene, name: string): void;
  report(message: string): void;
  isLive(): boolean;
  cancel(): void;
}
function analyze(value: Source) {
  return { ...value, ...inspectSvgImport(value.source) };
}
function ImportPanel({
  initialDraft,
  native,
  apply,
  report,
  isLive,
  cancel,
}: Props & { initialDraft: ReturnType<typeof analyze> | null }) {
  const id = useId(),
    [draft, setDraft] = useState(initialDraft),
    [busy, setBusy] = useState(false);
  const load = async (file: File) => {
    setBusy(true);
    setDraft(null);
    try {
      const value = await readSvgFile(file);
      if (isLive()) setDraft(analyze(value));
    } catch (error) {
      if (isLive()) report(error instanceof Error ? error.message : "Não foi possível ler o SVG.");
    } finally {
      if (isLive()) setBusy(false);
    }
  };
  return (
    <>
      <div className="dialog-heading">
        <h2>Importar SVG</h2>
        <button type="button" aria-label="Fechar importação" onClick={cancel}>
          ×
        </button>
      </div>
      <div className="help-content">
        <p>
          O arquivo entra em uma nova prancheta. A arte e as animações anteriores são preservadas.
        </p>
        <label className="scene-field" htmlFor={id}>
          Arquivo SVG
          <input
            id={id}
            name="svg-file"
            type="file"
            accept=".svg,image/svg+xml"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void load(file);
            }}
          />
        </label>
        {native && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setDraft(null);
              try {
                const source = await native();
                if (source !== null && isLive())
                  setDraft(analyze({ source, name: "SVG importado" }));
              } catch (error) {
                if (isLive())
                  report(error instanceof Error ? error.message : "Não foi possível abrir o SVG.");
              } finally {
                if (isLive()) setBusy(false);
              }
            }}
          >
            Abrir diálogo nativo
          </button>
        )}
        {draft && (
          <>
            <label className="scene-field">
              Nome da nova prancheta
              <input
                name="imported-artboard-name"
                autoComplete="off"
                aria-label="Nome da prancheta importada"
                maxLength={120}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <p role="status">
              {draft.report.errors} erros · {draft.report.warnings} avisos ·{" "}
              {draft.report.totalObjects} elementos inspecionados
            </p>
            <ul className="import-report">
              {draft.report.issues.map((issue) => (
                <li key={issue.id}>
                  <strong>
                    {issue.severity === "error" ? "Erro" : "Aviso"} · {issue.path}
                  </strong>
                  <p>{issue.message}</p>
                </li>
              ))}
            </ul>
            {draft.report.omitted > 0 && (
              <p>
                {draft.report.omitted} diagnósticos adicionais não exibidos; limite de 100. Nenhuma
                importação parcial é aplicada.
              </p>
            )}
            <p className="micro">
              Perfil atual: grupos, paths, formas e texto simples; cores sólidas, gradientes locais
              e atributos inline. Nomes/descrições simples e referências ARIA locais suportadas
              tornam-se semântica editável; metadados fora desse perfil geram diagnóstico. Clip/mask
              locais aceitam uma geometria por definição em userSpaceOnUse; máscaras exigem alpha
              explícito e região absoluta que contenha toda a silhueta. Primitivas permanecem
              nativas e os efeitos usam grupos/fontes locais editáveis. Imagens externas,
              luminância, objectBoundingBox, efeitos recursivos/compostos, tspan, scripts, papéis
              interativos e estilos externos são recusados. A fonte original acompanha a cena.
            </p>
          </>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" onClick={cancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !draft?.scene || !draft.name.trim()}
          onClick={() => {
            if (draft?.scene)
              try {
                apply(draft.scene, draft.name.trim());
              } catch (error) {
                report(error instanceof Error ? error.message : "Não foi possível importar.");
              }
          }}
        >
          Importar nova prancheta
        </button>
      </div>
    </>
  );
}
export function mountSvgImport(dialog: HTMLDialogElement, props: Omit<Props, "cancel" | "isLive">) {
  dialog.setAttribute("aria-label", "Importar SVG");
  let live = true;
  const root = createRoot(dialog);
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeAttribute("aria-label");
    dialog.removeEventListener("cancel", cancelEvent);
    root.unmount();
  };
  const cancel = () => {
    dispose();
    dialog.close();
  };
  const cancelEvent = (event: Event) => {
    event.preventDefault();
    cancel();
  };
  dialog.addEventListener("cancel", cancelEvent);
  const initialDraft = props.initial ? analyze(props.initial) : null;
  flushSync(() =>
    root.render(
      <ImportPanel {...props} initialDraft={initialDraft} cancel={cancel} isLive={() => live} />,
    ),
  );
  dialog.showModal();
  return dispose;
}
