import { type VectorEffects, vectorEffectsSchema } from "@informach/edi-motion/graphics";
import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FILTER_PRESET_LABELS,
  FILTER_PRESETS,
  type FilterPreset,
  filterFromPreset,
} from "../../shared/filterPresets";
import { PATH_TAGS } from "../../shared/pathGeometry.js";
import { flattenScene } from "../../shared/scene.js";
import type { Scene, SceneNode } from "../../shared/sceneTypes";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}
function EffectsPanel({ scene, node, locked, execute }: Props) {
  const id = useId(),
    [error, setError] = useState(""),
    sources = flattenScene(scene).filter(
      ({ node: source }) =>
        source.id !== node.id &&
        PATH_TAGS.has(source.tag) &&
        (source.tag !== "path" || source.attrs.d?.trim()) &&
        !source.effects,
    );
  return (
    <section className="resource-editor" aria-label="Recortes e máscaras">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget),
              clip = String(data.get("clip-source") ?? ""),
              mask = String(data.get("mask-source") ?? ""),
              value: VectorEffects = {};
            if (clip)
              value.clip = {
                sourceId: clip,
                rule: data.get("clip-rule") === "evenodd" ? "evenodd" : "nonzero",
              };
            const mode = data.get("mask-mode");
            if (mask)
              value.mask = {
                sourceId: mask,
                rule: data.get("mask-rule") === "evenodd" ? "evenodd" : "nonzero",
                opacity: Number(data.get("mask-opacity")),
                ...(mode === "alpha" || mode === "luminance" ? { mode } : {}),
              };
            const effects = clip || mask ? vectorEffectsSchema.parse(value) : null;
            execute([{ type: "scene", operation: "effects", targetId: node.id, value: effects }]);
            setError("");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Efeito recusado.");
          }
        }}
      >
        <fieldset disabled={locked}>
          <legend>Recortes e máscaras</legend>
          {(["clip", "mask"] as const).map((kind) => (
            <div className="resource-group" key={kind}>
              <label htmlFor={`${id}-${kind}-source`}>
                {kind === "clip" ? "Fonte do recorte" : "Fonte da máscara alpha"}
                <select
                  id={`${id}-${kind}-source`}
                  name={`${kind}-source`}
                  defaultValue={node.effects?.[kind]?.sourceId ?? ""}
                >
                  <option value="">Sem {kind === "clip" ? "recorte" : "máscara"}</option>
                  {sources.map(({ node: source }) => (
                    <option key={source.id} value={source.id}>
                      {source.name || source.id}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-${kind}-rule`}>
                Regra {kind === "clip" ? "do recorte" : "da máscara"}
                <select
                  id={`${id}-${kind}-rule`}
                  name={`${kind}-rule`}
                  defaultValue={node.effects?.[kind]?.rule ?? "nonzero"}
                >
                  <option value="nonzero">Não zero</option>
                  <option value="evenodd">Par / ímpar</option>
                </select>
              </label>
              {kind === "mask" && (
                <label htmlFor={`${id}-mask-mode`}>
                  Modo da máscara
                  <select
                    id={`${id}-mask-mode`}
                    name="mask-mode"
                    defaultValue={node.effects?.mask?.mode ?? "silhouette"}
                  >
                    <option value="silhouette">Silhueta da forma (ignora a pintura)</option>
                    <option value="alpha">Alpha da pintura da fonte</option>
                    <option value="luminance">Luminância da pintura da fonte</option>
                  </select>
                </label>
              )}
              {kind === "mask" && (
                <label htmlFor={`${id}-mask-opacity`}>
                  Intensidade da máscara
                  <input
                    id={`${id}-mask-opacity`}
                    name="mask-opacity"
                    type="number"
                    min={0}
                    max={1}
                    step="any"
                    required
                    defaultValue={node.effects?.mask?.opacity ?? 1}
                  />
                </label>
              )}
            </div>
          ))}
          <button type="submit">Aplicar recorte / máscara</button>
        </fieldset>
        <p className="micro">
          Use outra forma ou caminho da prancheta. Primitivas nativas preservam suas bordas;
          deformação exige conversão explícita para caminho. A fonte acompanha TRS, morph e
          deformação. Pode ficar oculta; não é ocultada automaticamente. O recorte usa a silhueta. A
          máscara em silhueta ignora a pintura; os modos alpha e luminância usam a pintura efetiva
          da fonte (cor, gradiente ou padrão, contorno), herdada dos grupos. Todos usam a opacidade
          animada da própria fonte, não a dos pais. Fonte pintada com filtro é recusada.
        </p>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
const AMOUNT_LABELS: Record<FilterPreset, string> = {
  "drop-shadow": "Desfoque da sombra (px)",
  blur: "Intensidade do desfoque (px)",
  glow: "Alcance do brilho (px)",
  saturate: "Fator de saturação",
  grayscale: "Sem ajuste",
  hue: "Rotação de matiz (graus)",
};
const DEFAULT_AMOUNT: Record<FilterPreset, number> = {
  "drop-shadow": 4,
  blur: 3,
  glow: 6,
  saturate: 1.5,
  grayscale: 0,
  hue: 90,
};
/** One typed filter per object, applied inside its transform (like the authored SVG) and before
 * its clip/mask. Every change is one transaction; nothing previews into the document. */
function FilterEditor({ node, locked, execute }: Omit<Props, "scene">) {
  const id = useId(),
    [preset, setPreset] = useState<FilterPreset>("drop-shadow"),
    [error, setError] = useState(""),
    shadow = preset === "drop-shadow",
    colored = shadow || preset === "glow";
  return (
    <form
      aria-label="Filtros"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            number = (name: string, fallback = 0) => {
              const raw = data.get(name);
              if (raw === null) return fallback;
              const value = Number(raw);
              if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(value))
                throw new Error("Informe valores numéricos do filtro.");
              return value;
            };
          const filter = filterFromPreset({
            preset,
            amount: number("filter-amount", DEFAULT_AMOUNT[preset]),
            dx: number("filter-dx"),
            dy: number("filter-dy"),
            color: String(data.get("filter-color") ?? "#000000"),
            opacity: number("filter-opacity", 1),
          });
          execute([{ type: "scene", operation: "filter", targetId: node.id, value: filter }]);
          setError("");
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Filtro recusado.");
        }
      }}
    >
      <fieldset disabled={locked}>
        <legend>Filtros</legend>
        <label htmlFor={`${id}-preset`}>
          Modelo de filtro
          <select
            id={`${id}-preset`}
            value={preset}
            onChange={(event) => {
              const value = FILTER_PRESETS.find((item) => item === event.target.value);
              if (value) setPreset(value);
            }}
          >
            {FILTER_PRESETS.map((value) => (
              <option key={value} value={value}>
                {FILTER_PRESET_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div key={preset} className="resource-pair">
          {preset !== "grayscale" && (
            <label htmlFor={`${id}-amount`}>
              {AMOUNT_LABELS[preset]}
              <input
                id={`${id}-amount`}
                name="filter-amount"
                type="number"
                step="any"
                min={preset === "hue" ? -36000 : 0}
                max={preset === "hue" ? 36000 : preset === "saturate" ? 100 : 200}
                required
                defaultValue={DEFAULT_AMOUNT[preset]}
              />
            </label>
          )}
          {shadow &&
            (["dx", "dy"] as const).map((name) => (
              <label key={name} htmlFor={`${id}-${name}`}>
                {name === "dx" ? "Deslocamento x (px)" : "Deslocamento y (px)"}
                <input
                  id={`${id}-${name}`}
                  name={`filter-${name}`}
                  type="number"
                  step="any"
                  min={-10000}
                  max={10000}
                  required
                  defaultValue={4}
                />
              </label>
            ))}
          {colored && (
            <>
              <label htmlFor={`${id}-color`}>
                {shadow ? "Cor da sombra" : "Cor do brilho"}
                <input
                  id={`${id}-color`}
                  name="filter-color"
                  type="color"
                  defaultValue={shadow ? "#000000" : "#4fe3c1"}
                />
              </label>
              <label htmlFor={`${id}-opacity`}>
                {shadow ? "Opacidade da sombra" : "Opacidade do brilho"}
                <input
                  id={`${id}-opacity`}
                  name="filter-opacity"
                  type="number"
                  min={0}
                  max={1}
                  step="any"
                  required
                  defaultValue={shadow ? 0.4 : 0.8}
                />
              </label>
            </>
          )}
        </div>
        <div className="resource-actions">
          <button type="submit">{node.filter ? "Substituir filtro" : "Aplicar filtro"}</button>
          <button
            type="button"
            disabled={!node.filter}
            onClick={() => {
              try {
                execute([{ type: "scene", operation: "filter", targetId: node.id, value: null }]);
                setError("");
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Filtro recusado.");
              }
            }}
          >
            Remover filtro
          </button>
        </div>
        <p className="micro">
          Aparece no canvas, Testar, HTML, React, SVG e imagens. Lottie recusa filtros.
        </p>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}
export function mountEffectsPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(
    <>
      <EffectsPanel {...props} />
      <section className="resource-editor" aria-label="Filtros do objeto">
        <FilterEditor node={props.node} locked={props.locked} execute={props.execute} />
      </section>
    </>,
  );
  return () => root.unmount();
}
