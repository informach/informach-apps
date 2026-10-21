import type { Asset } from "@informach/edi-motion/assets";
import { useId, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SceneNode } from "../../shared/sceneTypes";

interface Props {
  node: SceneNode;
  assets: Asset[];
  locked: boolean;
  execute(commands: unknown[]): void;
}
function ImagePanel({ node, assets, locked, execute }: Props) {
  const id = useId(),
    [enabled, setEnabled] = useState(!!node.imageSlice),
    [error, setError] = useState(""),
    image = assets.find((asset) => asset.id === node.assetId);
  if (image?.kind !== "image") return <p role="alert">Recurso de imagem ausente.</p>;
  return (
    <section className="resource-editor" aria-label="Propriedades da imagem">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget),
              value = (name: string) => {
                const raw = data.get(name);
                if (typeof raw !== "string" || !raw.trim())
                  throw new Error("Informe todos os números da imagem.");
                const number = Number(raw);
                if (!Number.isFinite(number)) throw new Error("Número da imagem inválido.");
                return number;
              };
            execute([
              {
                type: "scene",
                operation: "attrs",
                targetId: node.id,
                value: Object.fromEntries(
                  ["x", "y", "width", "height"].map((key) => [key, String(value(key))]),
                ),
              },
              {
                type: "scene",
                operation: "image-slice",
                targetId: node.id,
                value: enabled
                  ? {
                      top: value("top"),
                      right: value("right"),
                      bottom: value("bottom"),
                      left: value("left"),
                    }
                  : null,
              },
            ]);
            setError("");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Imagem recusada.");
          }
        }}
      >
        <fieldset disabled={locked}>
          <legend>Dimensões e nine-slice</legend>
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key} htmlFor={`${id}-${key}`}>
              {
                {
                  x: "Imagem X",
                  y: "Imagem Y",
                  width: "Largura da imagem",
                  height: "Altura da imagem",
                }[key]
              }
              <input
                id={`${id}-${key}`}
                type="number"
                name={key}
                required
                min={key === "width" || key === "height" ? 0 : -100000}
                max={100000}
                step="any"
                defaultValue={
                  node.attrs[key] ??
                  (key === "width" ? image.width : key === "height" ? image.height : 0)
                }
              />
            </label>
          ))}
          <label className="resource-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Preservar bordas com nine-slice
          </label>
          {enabled &&
            (["top", "right", "bottom", "left"] as const).map((key) => (
              <label key={key} htmlFor={`${id}-${key}`}>
                {
                  {
                    top: "Borda superior",
                    right: "Borda direita",
                    bottom: "Borda inferior",
                    left: "Borda esquerda",
                  }[key]
                }
                <input
                  id={`${id}-${key}`}
                  type="number"
                  name={key}
                  required
                  min={0}
                  max={key === "top" || key === "bottom" ? image.height : image.width}
                  step="any"
                  defaultValue={node.imageSlice?.[key] ?? 0}
                />
              </label>
            ))}
          <button type="submit">Aplicar dimensões da imagem</button>
        </fieldset>
        <p className="micro">
          Bordas em pixels da imagem original ({image.width} × {image.height}). O centro estica;
          cantos preservam tamanho quando possível. Em dimensões menores que as bordas, elas
          encolhem proporcionalmente. Nine-slice com layout usa espaço SVG/basis sem rotação/escala;
          TRS animável continua disponível.
        </p>
        {error && <p role="alert">{error}</p>}
      </form>
      <MeshForm node={node} image={image} locked={locked} execute={execute} />
    </section>
  );
}
/** Grid that lets bones (skin) and morphs deform the raster. */
function MeshForm({
  node,
  image,
  locked,
  execute,
}: Omit<Props, "assets"> & { image: { width: number; height: number } }) {
  const [error, setError] = useState(""),
    attempt = (commands: unknown[]) => {
      try {
        execute(commands);
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Malha recusada.");
      }
    };
  return (
    <form
      aria-label="Malha raster"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        attempt([
          // The grid spans the image box, so the box must be absolute and unclipped.
          {
            type: "scene",
            operation: "attrs",
            targetId: node.id,
            value: {
              width: node.attrs.width ?? String(image.width),
              height: node.attrs.height ?? String(image.height),
              preserveAspectRatio: "none",
            },
          },
          {
            type: "scene",
            operation: "image-mesh",
            targetId: node.id,
            value: {
              columns: Number(data.get("columns")),
              rows: Number(data.get("rows")),
            },
          },
        ]);
      }}
    >
      <fieldset disabled={locked || !!node.imageSlice}>
        <legend>Malha raster</legend>
        <label className="scene-field">
          Colunas
          <input
            name="columns"
            type="number"
            min="1"
            max="16"
            step="1"
            required
            defaultValue={node.imageMesh?.columns ?? 4}
          />
        </label>
        <label className="scene-field">
          Linhas
          <input
            name="rows"
            type="number"
            min="1"
            max="16"
            step="1"
            required
            defaultValue={node.imageMesh?.rows ?? 4}
          />
        </label>
        <button type="submit">{node.imageMesh ? "Atualizar malha" : "Criar malha"}</button>
        {node.imageMesh ? (
          <button
            type="button"
            onClick={() =>
              attempt([{ type: "scene", operation: "image-mesh", targetId: node.id, value: null }])
            }
          >
            Remover malha
          </button>
        ) : null}
      </fieldset>
      <p className="micro">
        A malha divide a imagem em triângulos que ossos (Restrições → Malha vetorial) e morphs podem
        deformar. A imagem passa a esticar na caixa (sem manter o aspecto). Nine-slice e malha são
        exclusivos. SVG animado e Lottie não exportam a malha deformada; HTML, React e vídeo sim.
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function mountImagePanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<ImagePanel {...props} />);
  return () => root.unmount();
}
