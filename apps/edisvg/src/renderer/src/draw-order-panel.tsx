import type { Animation, DrawOrder } from "@informach/edi-motion";
import { createRoot } from "react-dom/client";
import { flattenScene } from "../../shared/scene.js";
import type { Scene } from "../../shared/sceneTypes";

interface Props {
  clip: Animation;
  scene: Scene;
  selectedId: string;
  frame: number;
  locked: boolean;
  execute(commands: unknown[]): void;
}
/** The draw order of the selected object's parent in this artboard (root orders of other
 * artboards in a shared clip list other objects). */
export function scopeDrawOrder(clip: Animation, scopeId: string | null, siblings: Set<string>) {
  return clip.drawOrders?.find(
    (drawOrder) =>
      drawOrder.scopeId === scopeId &&
      (scopeId !== null || drawOrder.keys.some((key) => key.order.some((id) => siblings.has(id)))),
  );
}
/** Same stepping as the runtime: listed siblings back to front, unlisted ones in front. */
export function stackAt(drawOrder: DrawOrder | undefined, authored: string[], frame: number) {
  const key = drawOrder?.keys.filter((item) => item.frame <= frame).at(-1) ?? drawOrder?.keys[0];
  if (!key) return authored;
  const present = new Set(authored),
    listed = key.order.filter((id) => present.has(id)),
    seen = new Set(listed);
  return [...listed, ...authored.filter((id) => !seen.has(id))];
}
function DrawOrderPanel({ clip, scene, selectedId, frame, locked, execute }: Props) {
  const entries = flattenScene(scene),
    entry = entries.find(({ node }) => node.id === selectedId);
  if (!entry) return null;
  const parentId: string | null = entry.parentId,
    siblings = entries.filter((item) => item.parentId === parentId).map(({ node }) => node),
    authored = siblings.map((node) => node.id),
    names = new Map(siblings.map((node) => [node.id, node.name])),
    drawOrder = scopeDrawOrder(clip, parentId, new Set(authored)),
    at = Math.round(frame),
    stack = stackAt(drawOrder, authored, at),
    index = stack.indexOf(selectedId),
    keyHere = drawOrder?.keys.find((key) => key.frame === at);
  const move = (offset: number) => {
    const order = [...stack];
    order.splice(index, 1);
    order.splice(index + offset, 0, selectedId);
    execute([
      {
        type: "motion",
        command: {
          type: "set-draw-order",
          animationId: clip.id,
          scopeId: parentId,
          frame: at,
          order,
        },
      },
    ]);
  };
  return (
    <section className="resource-editor" aria-label="Ordem de desenho animada">
      <h3>ORDEM DE DESENHO</h3>
      {siblings.length < 2 ? (
        <p className="micro">Sem outros objetos neste grupo para reordenar.</p>
      ) : (
        <>
          <ol aria-label="Pilha no quadro atual" className="draw-order-stack">
            {[...stack].reverse().map((id) => (
              <li key={id} aria-current={id === selectedId ? "true" : undefined}>
                {names.get(id)}
              </li>
            ))}
          </ol>
          <div className="scene-tools">
            <button
              type="button"
              disabled={locked || index === stack.length - 1}
              onClick={() => move(1)}
            >
              Subir neste quadro
            </button>
            <button type="button" disabled={locked || index === 0} onClick={() => move(-1)}>
              Descer neste quadro
            </button>
            {drawOrder && keyHere ? (
              <button
                type="button"
                disabled={locked}
                onClick={() =>
                  execute([
                    {
                      type: "motion",
                      command: {
                        type: "delete-draw-order-key",
                        animationId: clip.id,
                        drawOrderId: drawOrder.id,
                        frame: at,
                      },
                    },
                  ])
                }
              >
                Remover chave de ordem
              </button>
            ) : null}
          </div>
          <p className="micro">
            {drawOrder
              ? `Chaves de ordem nos quadros ${drawOrder.keys.map((key) => key.frame).join(", ")}. A ordem troca em degraus; antes da primeira chave vale a primeira.`
              : "Sem chaves: vale a ordem das camadas. Subir/Descer grava uma chave no quadro atual."}{" "}
            SVG animado e Lottie recusam ordem animada; HTML, React e vídeo a preservam.
          </p>
        </>
      )}
    </section>
  );
}
/** The playhead moves without a full render: update follows it. */
export function mountDrawOrderPanel(host: Element, props: Props) {
  const root = createRoot(host);
  let current = props;
  root.render(<DrawOrderPanel {...current} />);
  return {
    update(frame: number) {
      if (Math.round(frame) !== Math.round(current.frame)) {
        current = { ...current, frame };
        root.render(<DrawOrderPanel {...current} />);
      }
    },
    dispose: () => root.unmount(),
  };
}
