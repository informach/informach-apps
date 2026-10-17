import {
  type Anchor,
  baseLayer,
  DEFAULT_VECTOR,
  IDENTITY,
  type Point,
  type VectorLayer,
  type VectorStyle,
} from "@shared/doc";
import { SHAPE_LABELS } from "@shared/vector";
import { updateLayer, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { OpError, requireDoc, requireLayer } from "./ops";

export function addVector(vector: Partial<VectorStyle>, at?: Point): string {
  const doc = requireDoc(),
    v = { ...structuredClone(DEFAULT_VECTOR), ...vector };
  const layer: VectorLayer = {
    ...baseLayer(SHAPE_LABELS[v.shape]),
    kind: "vector",
    vector: v,
    transform: { ...IDENTITY, x: at?.x ?? doc.width / 2, y: at?.y ?? doc.height / 2 },
  };
  useDoc.getState().commit(`Criar ${layer.name}`, (d) => ({ ...d, layers: [...d.layers, layer] }), {
    active: layer.id,
  });
  useUi.setState({ tab: "layers" });
  return layer.id;
}

export function editVector(id: string, changes: Partial<VectorStyle>, key?: string): void {
  const l = requireLayer(id);
  if (l.kind !== "vector") throw new OpError("Selecione uma camada vetorial.");
  if (l.locked) throw new OpError("A camada está bloqueada.");
  const v = { ...l.vector, ...changes };
  if (
    v.fillOpacity !== undefined &&
    (!Number.isFinite(v.fillOpacity) || v.fillOpacity < 0 || v.fillOpacity > 1)
  )
    throw new OpError("Opacidade inválida.");
  if (
    v.shape === "path" &&
    !changes.points &&
    (changes.width !== undefined || changes.height !== undefined)
  ) {
    const sx = v.width / l.vector.width,
      sy = v.height / l.vector.height;
    const scale = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy });
    v.points = v.points.map((p) => ({
      ...p,
      ...scale(p),
      incoming: p.incoming && scale(p.incoming),
      outgoing: p.outgoing && scale(p.outgoing),
    }));
  }
  if (
    ![v.width, v.height, v.radius, v.sides, v.innerRadius, v.strokeWidth].every(Number.isFinite) ||
    v.width <= 0 ||
    v.height <= 0 ||
    v.strokeWidth < 0
  )
    throw new OpError("Dimensões vetoriais inválidas.");
  useDoc
    .getState()
    .commit("Editar vetor", (d) => updateLayer<VectorLayer>(d, id, (x) => ({ ...x, vector: v })), {
      key: key ?? `vector:${id}`,
    });
}

export function finishPen(closed = false): void {
  const ui = useUi.getState(),
    points = ui.penPoints;
  if (points.length < 2) return;
  const all: Point[] = points.flatMap((p) => [
    p,
    ...(p.incoming ? [p.incoming] : []),
    ...(p.outgoing ? [p.outgoing] : []),
  ]);
  const minX = Math.min(...all.map((p) => p.x)),
    minY = Math.min(...all.map((p) => p.y));
  const w = Math.max(1, Math.max(...all.map((p) => p.x)) - minX),
    h = Math.max(1, Math.max(...all.map((p) => p.y)) - minY);
  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY });
  const local: Anchor[] = points.map((p) => ({
    ...shift(p),
    smooth: p.smooth,
    incoming: p.incoming && shift(p.incoming),
    outgoing: p.outgoing && shift(p.outgoing),
  }));
  addVector(
    {
      ...ui.vector,
      shape: "path",
      width: w,
      height: h,
      points: local,
      closed,
      fillColor: closed ? ui.vector.fillColor : null,
    },
    { x: minX + w / 2, y: minY + h / 2 },
  );
  useUi.setState({ penPoints: [], penSelected: null });
}
