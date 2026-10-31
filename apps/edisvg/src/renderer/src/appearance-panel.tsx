import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import { inheritedAppearance, inheritedGradients } from "../../shared/appearance";
import { appearanceKeys } from "../../shared/appearanceContracts";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { GradientPanel } from "./gradient-panel";
import { PaintControls } from "./paint-controls";
import type { TrimEffectsHost } from "./path-effects";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
  effects?: TrimEffectsHost;
}

let gradientsExpanded = false;
let stylesExpanded = false;

function AppearancePanel({ scene, node, locked, execute, effects }: Props) {
  const id = useId();
  const effective = inheritedAppearance(scene, node);
  const effectiveGradients = inheritedGradients(scene, node);
  const [name, setName] = useState("");
  const [style, setStyle] = useState(scene.styles?.[0]?.id ?? "");
  const [error, setError] = useState("");

  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aparência recusada.");
    }
  };

  return (
    <section className="appearance-panel">
      <PaintControls
        scene={scene}
        node={node}
        locked={locked}
        execute={execute}
        effects={effects}
      />
      <details
        className="paint-advanced"
        open={gradientsExpanded}
        onToggle={(event) => {
          gradientsExpanded = event.currentTarget.open;
        }}
      >
        <summary>Gradientes e padrões</summary>
        <GradientPanel node={node} locked={locked} execute={execute} />
      </details>
      <details
        className="paint-advanced"
        open={stylesExpanded}
        onToggle={(event) => {
          stylesExpanded = event.currentTarget.open;
        }}
      >
        <summary>Estilos e paleta</summary>
        <fieldset disabled={locked} className="paint-styles">
          {(scene.palette?.length ?? 0) > 0 && (
            <fieldset className="color-palette" aria-label="Paleta da prancheta">
              <legend>Paleta</legend>
              {scene.palette?.map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-label={`Remover ${color} da paleta`}
                  title={`Remover ${color}`}
                  style={{ backgroundColor: color }}
                  onClick={() =>
                    apply([
                      {
                        type: "appearance",
                        operation: "palette",
                        colors: scene.palette?.filter((item) => item !== color),
                      },
                    ])
                  }
                >
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </fieldset>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              apply([
                {
                  type: "appearance",
                  operation: "save-style",
                  style: {
                    id: `style-${crypto.randomUUID()}`,
                    name: name.trim(),
                    attrs: Object.fromEntries(
                      appearanceKeys.flatMap((key) =>
                        effective[key] === undefined ? [] : [[key, effective[key]]],
                      ),
                    ),
                    ...(effectiveGradients.fill || effectiveGradients.stroke
                      ? { gradients: structuredClone(effectiveGradients) }
                      : {}),
                  },
                },
              ]);
            }}
          >
            <label className="scene-field" htmlFor={id}>
              Nome do estilo
              <input
                id={id}
                autoComplete="off"
                maxLength={120}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit">Guardar estilo</button>
          </form>
          <label className="scene-field">
            Estilo
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="">Selecione…</option>
              {scene.styles?.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="scene-tools">
            <button
              type="button"
              disabled={!style}
              onClick={() =>
                apply([
                  {
                    type: "appearance",
                    operation: "apply-style",
                    styleId: style,
                    targetIds: [node.id],
                  },
                ])
              }
            >
              Aplicar
            </button>
            <button
              type="button"
              disabled={!style}
              onClick={() =>
                apply([{ type: "appearance", operation: "delete-style", styleId: style }])
              }
            >
              Excluir
            </button>
          </div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </details>
    </section>
  );
}

export function mountAppearancePanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<AppearancePanel {...props} />);
  return () => root.unmount();
}
