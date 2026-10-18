import { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { inheritedAppearance, inheritedGradients } from "../../shared/appearance";
import { appearanceKeys } from "../../shared/appearanceContracts";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { GradientPanel } from "./gradient-panel";

declare global {
  interface Window {
    EyeDropper?: new () => { open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }> };
  }
}
interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}
const hex = (value: string) =>
  /^#[\da-f]{6}$/i.test(value)
    ? value
    : /^#[\da-f]{3}$/i.test(value)
      ? `#${[...value.slice(1)].map((char) => char + char).join("")}`
      : null;
function AppearancePanel({ scene, node, locked, execute }: Props) {
  const id = useId(),
    effective = inheritedAppearance(scene, node),
    effectiveGradients = inheritedGradients(scene, node),
    [fill, setFill] = useState(hex(effective.fill ?? "") ?? "#000000"),
    [stroke, setStroke] = useState(hex(effective.stroke ?? "") ?? "#000000"),
    [name, setName] = useState(""),
    [style, setStyle] = useState(scene.styles?.[0]?.id ?? ""),
    [error, setError] = useState(""),
    [sampling, setSampling] = useState(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Aparência recusada.");
    }
  };
  const sample = async () => {
    if (!window.EyeDropper || controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setSampling(true);
    try {
      const color = await new window.EyeDropper().open({ signal: task.signal });
      if (!task.signal.aborted && hex(color.sRGBHex)) setFill(color.sRGBHex);
    } catch (error) {
      if (!task.signal.aborted && !(error instanceof DOMException && error.name === "AbortError"))
        setError(error instanceof Error ? error.message : "Não foi possível amostrar a cor.");
    } finally {
      if (!task.signal.aborted) {
        controller.current = null;
        setSampling(false);
      }
    }
  };
  return (
    <section>
      <h3>CORES E ESTILOS</h3>
      <p className="micro">
        Efetivo: preenchimento {effectiveGradients.fill ? "gradiente" : effective.fill}, contorno{" "}
        {effectiveGradients.stroke ? "gradiente" : effective.stroke}.{" "}
        {node.attrs.fill === undefined || node.attrs.fill === "inherit"
          ? "Preenchimento herdado."
          : "Preenchimento local."}{" "}
        Seletores abaixo aplicam cores sólidas explícitas.
      </p>
      <fieldset disabled={locked || sampling}>
        <label className="scene-field">
          Cor de preenchimento
          <input
            type="color"
            name="fill-color"
            value={fill}
            onChange={(event) => setFill(event.target.value)}
          />
        </label>
        <label className="scene-field">
          Cor de contorno
          <input
            type="color"
            name="stroke-color"
            value={stroke}
            onChange={(event) => setStroke(event.target.value)}
          />
        </label>
        <div className="scene-tools">
          <button
            type="button"
            onClick={() =>
              apply([
                { type: "scene", operation: "attrs", targetId: node.id, value: { fill, stroke } },
              ])
            }
          >
            Aplicar cores
          </button>
          <button
            type="button"
            disabled={!window.EyeDropper}
            title={
              !window.EyeDropper
                ? "Amostragem de tela indisponível nesta plataforma; use o seletor de cor."
                : "Selecione um pixel; Escape cancela."
            }
            onClick={() => void sample()}
          >
            Amostrar preenchimento
          </button>
        </div>
        <fieldset className="color-palette" aria-label="Paleta da prancheta">
          {(scene.palette ?? []).map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`Usar ${color} no preenchimento`}
              title={color}
              style={{ backgroundColor: color }}
              onClick={() => setFill(color)}
            />
          ))}
        </fieldset>
        <div className="scene-tools">
          <button
            type="button"
            disabled={
              (scene.palette?.length ?? 0) >= 64 ||
              scene.palette?.some((color) => color.toLowerCase() === fill.toLowerCase())
            }
            onClick={() =>
              apply([
                {
                  type: "appearance",
                  operation: "palette",
                  colors: [...(scene.palette ?? []), fill],
                },
              ])
            }
          >
            Guardar cor na paleta
          </button>
          <button
            type="button"
            disabled={!scene.palette?.some((color) => color.toLowerCase() === fill.toLowerCase())}
            onClick={() =>
              apply([
                {
                  type: "appearance",
                  operation: "palette",
                  colors: scene.palette?.filter(
                    (color) => color.toLowerCase() !== fill.toLowerCase(),
                  ),
                },
              ])
            }
          >
            Remover cor selecionada
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim())
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
              name="style-name"
              autoComplete="off"
              maxLength={120}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit">Guardar aparência efetiva como estilo</button>
        </form>
        <label className="scene-field">
          Estilo reutilizável
          <select
            name="appearance-style"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            <option value="">Selecione…</option>
            {scene.styles?.map((style) => (
              <option value={style.id} key={style.id}>
                {style.name}
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
            Aplicar estilo
          </button>
          <button
            type="button"
            disabled={!style}
            onClick={() =>
              apply([{ type: "appearance", operation: "delete-style", styleId: style }])
            }
          >
            Excluir estilo
          </button>
        </div>
      </fieldset>
      <GradientPanel node={node} locked={locked || sampling} execute={execute} />
      {sampling && (
        <button
          type="button"
          onClick={() => {
            controller.current?.abort();
            controller.current = null;
            setSampling(false);
          }}
        >
          Cancelar amostragem
        </button>
      )}
      <p role="status">{error || (sampling ? "Escolha uma cor na tela; Escape cancela." : "")}</p>
      <p className="micro">
        Paleta e até 100 estilos são salvos nesta prancheta. Aplicar copia os valores; alterar ou
        excluir o estilo não altera objetos já pintados. Desfazer restaura edições.
      </p>
    </section>
  );
}
export function mountAppearancePanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<AppearancePanel {...props} />);
  return () => root.unmount();
}
