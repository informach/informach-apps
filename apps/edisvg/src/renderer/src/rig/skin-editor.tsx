import type { RigDocument, RigSkin } from "@informach/edi-motion/rig";
import type { Artboard } from "../../../shared/project";
import type { RigCommand } from "../../../shared/rig";
import { flattenScene } from "../../../shared/scene.js";
import { numberValue, textValue } from "./constraint-editor";

export function SkinEditor({
  board,
  rig,
  selectedId,
  vertexIndex,
  selectVertex,
  execute,
  report,
}: {
  board: Artboard;
  rig: RigDocument;
  selectedId: string | null;
  vertexIndex: number;
  selectVertex(index: number): void;
  execute(command: RigCommand): void;
  report(error: unknown): void;
}) {
  const entries = flattenScene(board.scene),
    selected = entries.find(({ node }) => node.id === selectedId),
    skin = rig.skins?.find((skin) => skin.targetId === selectedId),
    index = Math.min(vertexIndex, (skin?.weights.length ?? 1) - 1),
    weights = skin?.weights[index] ?? [];
  const attempt = (callback: () => void) => {
    try {
      callback();
    } catch (error) {
      report(error);
    }
  };
  return (
    <section aria-label="Malha vetorial">
      <h3>MALHA VETORIAL · PESOS</h3>
      <p className="micro">
        Vértices e suas alças deformam por até quatro ossos. Referência capturada em Design; pesos
        automáticos usam distância aos segmentos. Imagens raster ainda dependem do catálogo/render
        do lote 5.
      </p>
      {selected?.node.tag !== "path" ? (
        <p className="micro">Selecione um caminho vetorial.</p>
      ) : !skin ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            attempt(() => {
              const data = new FormData(event.currentTarget),
                boneIds = data.getAll("bone").map((value) => {
                  if (typeof value !== "string") throw new Error("Osso inválido.");
                  return value;
                });
              if (!data.has("confirm")) throw new Error("Confirme a referência de deformação.");
              execute({
                type: "rig",
                operation: "bind-skin",
                id: `skin-${crypto.randomUUID()}`,
                targetId: selected.node.id,
                boneIds,
                confirmRestPose: true,
              });
            });
          }}
        >
          <fieldset disabled={selected.locked || !rig.bones.length}>
            <legend>Ossos de influência</legend>
            <select
              aria-label="Ossos para malha"
              name="bone"
              multiple
              required
              size={Math.min(6, Math.max(2, rig.bones.length))}
              defaultValue={rig.bones.slice(0, 4).map((bone) => bone.targetId)}
            >
              {rig.bones.map((bone) => (
                <option key={bone.targetId} value={bone.targetId}>
                  {entries.find(({ node }) => node.id === bone.targetId)?.node.name ??
                    bone.targetId}
                </option>
              ))}
            </select>
            <label className="check-row">
              <input name="confirm" type="checkbox" required />
              Capturar referência atual; acrescentar deformação futura.
            </label>
            <button type="submit">Vincular malha vetorial</button>
          </fieldset>
        </form>
      ) : (
        <fieldset disabled={selected.locked}>
          <legend>
            {skin.weights.length} vértices · {skin.bones.length} ossos
          </legend>
          <label className="scene-field">
            Vértice da malha
            <input
              aria-label="Vértice da malha"
              type="number"
              min="0"
              max={skin.weights.length - 1}
              step="1"
              value={index}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value < skin.weights.length)
                  selectVertex(value);
              }}
            />
          </label>
          <form
            key={`${skin.id}-${index}`}
            onSubmit={(event) => {
              event.preventDefault();
              attempt(() => {
                const data = new FormData(event.currentTarget),
                  next: RigSkin["weights"][number] = [];
                for (let slot = 0; slot < 4; slot++) {
                  const boneId = textValue(data, `bone-${slot}`),
                    weight = numberValue(data, `weight-${slot}`) / 100;
                  if (weight > 0) {
                    if (!boneId) throw new Error("Peso positivo requer osso.");
                    next.push({ boneId, weight });
                  }
                }
                execute({
                  type: "rig",
                  operation: "replace",
                  value: {
                    ...rig,
                    skins: rig.skins?.map((value) =>
                      value.id === skin.id
                        ? {
                            ...value,
                            weights: value.weights.map((weights, i) =>
                              i === index ? next : weights,
                            ),
                          }
                        : value,
                    ),
                  },
                });
              });
            }}
          >
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot}>
                <label className="scene-field">
                  Influência {slot + 1}
                  <select
                    aria-label={`Osso da influência ${slot + 1}`}
                    name={`bone-${slot}`}
                    defaultValue={weights[slot]?.boneId ?? ""}
                  >
                    <option value="">Nenhum</option>
                    {skin.bones.map((bone) => (
                      <option key={bone.targetId} value={bone.targetId}>
                        {entries.find(({ node }) => node.id === bone.targetId)?.node.name ??
                          bone.targetId}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="scene-field">
                  Peso {slot + 1} (%)
                  <input
                    aria-label={`Peso da influência ${slot + 1} (%)`}
                    name={`weight-${slot}`}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    defaultValue={(weights[slot]?.weight ?? 0) * 100}
                    required
                  />
                </label>
              </div>
            ))}
            <p className="micro">
              Pesos positivos precisam somar 100%. Zero remove a influência. Ossos repetidos são
              recusados; não há normalização silenciosa.
            </p>
            <button type="submit">Aplicar pesos do vértice</button>
          </form>
          <button
            type="button"
            onClick={() =>
              attempt(() =>
                execute({
                  type: "rig",
                  operation: "replace",
                  value: { ...rig, skins: rig.skins?.filter((value) => value.id !== skin.id) },
                }),
              )
            }
          >
            Remover malha, manter referência vetorial
          </button>
        </fieldset>
      )}
    </section>
  );
}
