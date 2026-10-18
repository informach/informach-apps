import { type VectorEffects, vectorEffectsSchema } from "@informach/edi-motion/graphics";
import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
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
            if (mask)
              value.mask = {
                sourceId: mask,
                rule: data.get("mask-rule") === "evenodd" ? "evenodd" : "nonzero",
                opacity: Number(data.get("mask-opacity")),
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
          deformação. Pode ficar oculta; não é ocultada automaticamente. O recorte usa a silhueta; a
          máscara alpha usa também a opacidade animada da própria fonte, sem sua pintura ou a
          opacidade dos pais.
        </p>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
export function mountEffectsPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<EffectsPanel {...props} />);
  return () => root.unmount();
}
