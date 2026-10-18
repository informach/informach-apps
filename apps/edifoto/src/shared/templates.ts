import {
  baseLayer,
  DEFAULT_TEXT,
  DEFAULT_VECTOR,
  type Doc,
  IDENTITY,
  type Layer,
  newId,
} from "./doc.ts";
export const IMAGE_TEMPLATES = [
  {
    id: "headline",
    name: "Título em destaque",
    description: "Texto grande e formas editáveis",
    width: 1920,
    height: 1080,
  },
  {
    id: "split",
    name: "Imagem e texto",
    description: "Espaço para uma imagem e uma mensagem",
    width: 1920,
    height: 1080,
  },
  {
    id: "square",
    name: "Quadrado",
    description: "Uma composição para compartilhar",
    width: 1080,
    height: 1080,
  },
  {
    id: "page",
    name: "Página A4",
    description: "Título, subtítulo e espaço livre",
    width: 1240,
    height: 1754,
  },
] as const;
export type TemplateId = (typeof IMAGE_TEMPLATES)[number]["id"];
export function createImageTemplate(id: TemplateId): Doc {
  const spec = IMAGE_TEMPLATES.find((item) => item.id === id);
  if (!spec) throw new Error("Modelo não encontrado.");
  const { width: w, height: h } = spec;
  const layers: Layer[] = [{ ...baseLayer("Fundo"), kind: "solid", color: "#f7f3ec" }];
  const shape = (
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): Layer => ({
    ...baseLayer(name),
    kind: "vector",
    vector: {
      ...DEFAULT_VECTOR,
      width,
      height,
      radius: 0,
      fillColor: color,
      strokeColor: null,
      points: [],
    },
    transform: { ...IDENTITY, x, y },
  });
  const text = (
    name: string,
    content: string,
    x: number,
    y: number,
    size: number,
    weight: number,
  ): Layer => ({
    ...baseLayer(name),
    kind: "text",
    text: {
      ...DEFAULT_TEXT,
      content,
      color: "#25252b",
      align: "left",
      size,
      weight,
      maxWidth: id === "split" ? w * 0.38 : w * 0.8,
    },
    transform: { ...IDENTITY, x, y },
  });
  layers.push(shape("Destaque", w * 0.1, h * 0.14, w * 0.06, h * 0.016, "#ff7a45"));
  if (id === "split")
    layers.push({
      ...shape("Espaço para imagem", w * 0.72, h * 0.5, w * 0.44, h * 0.8, "#ddd8cf"),
      role: "image-placeholder",
    });
  layers.push(
    text(
      "Título",
      "Seu título aqui",
      id === "split" ? w * 0.26 : w * 0.5,
      h * 0.36,
      w * (id === "page" ? 0.055 : 0.065),
      750,
    ),
  );
  layers.push(
    text(
      "Descrição",
      "Adicione uma descrição",
      id === "split" ? w * 0.26 : w * 0.5,
      h * 0.7,
      w * 0.025,
      400,
    ),
  );
  return { id: newId("d"), name: spec.name, width: w, height: h, layers };
}
