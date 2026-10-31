import { type RigDocument, trimSchema, upgradeRigVersion } from "@informach/edi-motion/rig";
import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";
import { numberValue } from "./constraint-editor";

export function TrimEditor({
  board,
  rig,
  selectedId,
  save,
  report,
}: {
  board: Artboard;
  rig: RigDocument;
  selectedId: string | null;
  save(value: RigDocument): void;
  report(error: unknown): void;
}) {
  const selected = flattenScene(board.scene).find(({ node }) => node.id === selectedId),
    // Paint layer trims live in each layer's row options; this is the shape's own.
    trim = rig.trims?.find((value) => value.targetId === selectedId && !value.layerId),
    nativeArc = /[aA]/.test(selected?.node.attrs.d ?? "");
  if (selected?.node.tag !== "path")
    return <p className="micro">Selecione um caminho para configurar o recorte animável.</p>;
  return (
    <section aria-label="Recorte animável do caminho">
      <h3>RECORTE DO CAMINHO</h3>
      <p className="micro">
        Início e fim usam comprimento local, após morph e malha, antes das transformações visuais.
        Alças Bézier são preservadas. Preenchimentos fecham os trechos abertos conforme SVG; use sem
        preenchimento para desenhar somente o contorno. Anime início/fim/offset em Parâmetros.
      </p>
      {nativeArc && (
        <p role="status" className="micro">
          Este caminho contém arcos SVG nativos. Use a conversão cúbica com prévia e confirmação de
          aparência antes de adicionar o recorte; a aproximação não é automática.
        </p>
      )}
      <form
        key={trim?.id ?? selected.node.id}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget),
              value = trimSchema.parse({
                id: trim?.id ?? `trim-${crypto.randomUUID()}`,
                targetId: selected.node.id,
                start: numberValue(data, "start") / 100,
                end: numberValue(data, "end") / 100,
                offset: numberValue(data, "offset"),
                tolerance: numberValue(data, "tolerance"),
                mode: data.get("mode"),
              });
            save({
              ...rig,
              version: upgradeRigVersion(rig.version, 3),
              trims: [...(rig.trims ?? []).filter((item) => item.id !== value.id), value],
            });
          } catch (error) {
            report(error);
          }
        }}
      >
        <label className="scene-field">
          Início (%)
          <input
            aria-label="Início do recorte (%)"
            name="start"
            type="number"
            min="0"
            max="100"
            step="any"
            defaultValue={(trim?.start ?? 0) * 100}
            required
          />
        </label>
        <label className="scene-field">
          Fim (%)
          <input
            aria-label="Fim do recorte (%)"
            name="end"
            type="number"
            min="0"
            max="100"
            step="any"
            defaultValue={(trim?.end ?? 1) * 100}
            required
          />
        </label>
        <label className="scene-field">
          Offset (graus)
          <input
            aria-label="Offset do recorte (graus)"
            name="offset"
            type="number"
            min="-36000"
            max="36000"
            step="any"
            defaultValue={trim?.offset ?? 0}
            required
          />
        </label>
        <label className="scene-field">
          Tolerância de comprimento (unidades locais)
          <input
            aria-label="Tolerância do recorte"
            name="tolerance"
            type="number"
            min="0.000001"
            max="100"
            step="any"
            defaultValue={trim?.tolerance ?? 0.01}
            required
          />
        </label>
        <label className="scene-field">
          Modo de recorte
          <select aria-label="Modo de recorte" name="mode" defaultValue={trim?.mode ?? "parallel"}>
            <option value="parallel">Cada contorno separadamente</option>
            <option value="sequential">Comprimento total do caminho</option>
          </select>
        </label>
        <button type="submit" disabled={selected.locked || nativeArc}>
          {trim ? "Atualizar recorte" : "Adicionar recorte"}
        </button>
      </form>
      {trim && (
        <>
          <button
            type="button"
            disabled={selected.locked}
            onClick={() => {
              try {
                save({ ...rig, trims: rig.trims?.filter((value) => value.id !== trim.id) });
              } catch (error) {
                report(error);
              }
            }}
          >
            Remover recorte
          </button>
          <p className="micro">
            Remova canais e bindings dependentes explicitamente antes de excluir o recorte.
          </p>
        </>
      )}
    </section>
  );
}
