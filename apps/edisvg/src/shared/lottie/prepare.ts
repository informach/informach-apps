import {
  GEOMETRY_BOUNDS_VERTEX_COST,
  type Geometry,
  parseGeometry,
} from "@informach/edi-motion/geometry";
import { parseSolidSvgColor, parseSvgOpacity as svgOpacity } from "@informach/edi-motion/graphics";
import { z } from "zod";
import { createPaintResolver } from "../appearance";
import { compileArtboard } from "../components";
import { artboardIdSchema } from "../identities";
import { requiresInteractiveExport } from "../interactiveCapabilities";
import { PATH_TAGS, pathFromNode } from "../pathGeometry.js";
import { parseProject } from "../project";
import { flattenScene } from "../scene.js";
import { lottieDashWork } from "./dashes";
import { LOTTIE_GRADIENT_SAMPLE_COST, prepareLottieGradient } from "./gradient";
import { LOTTIE_JSON_MAX_DEPTH } from "./json";
import type { LottieIssue, LottieReport, ShapeFill, StaticShapeGradientFill } from "./model";
import {
  hasNativeStraightSegments,
  prepareRelativeGradient,
  type RelativeLottieGradient,
} from "./relativeGradient";
import { LottieSampleError, visitLottieSamples } from "./sample";
import { type LottieStroke, prepareLottieStroke } from "./stroke";

export const lottieOptionsSchema = z.strictObject({
  artboardId: artboardIdSchema,
  animationId: z.string().regex(/^[a-z]+-[\w-]{1,100}$/),
  subdivisions: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(1),
  confirmSampling: z.boolean().default(false),
  confirmRendererPrecision: z.boolean().default(false),
  confirmAnimationOnly: z.boolean().default(false),
  alt: z.string().max(200).default(""),
});
export type LottieOptions = z.infer<typeof lottieOptionsSchema>;
export const lottieReadSchema = lottieOptionsSchema.pick({
  artboardId: true,
  animationId: true,
  subdivisions: true,
});
export type LottiePaint = ShapeFill | StaticShapeGradientFill | RelativeLottieGradient;
export { svgOpacity };
/** Snapshot-only preparation. Inspection visits bounded stroke samples but
 * writes no output; worker/compiler share the same profile validators. */
export function prepareLottie(rawProject: unknown, rawOptions: unknown) {
  const project = parseProject(rawProject),
    options = lottieOptionsSchema.parse(rawOptions),
    board = project.artboards.find((entry) => entry.id === options.artboardId),
    clip = project.motion.animations.find((entry) => entry.id === options.animationId);
  if (!board || !clip) throw new Error("Lottie requer prancheta e animação por objeto existentes.");
  const compiled = compileArtboard(project, board.id, { spatial: true }),
    entries = flattenScene(compiled.scene),
    paintOf = createPaintResolver(compiled.scene),
    geometries = new Map<string, Geometry>(),
    paints = new Map<string, LottiePaint>(),
    strokes = new Map<string, LottieStroke>(),
    issues: LottieIssue[] = [];
  let totalIssues = 0,
    errors = 0,
    vertices = 0,
    relativeVertices = 0,
    strokeGeometryWork = 0;
  function issue(
    objectId: string | null,
    code: string,
    message: string,
    severity: "error" | "warning" = "error",
  ) {
    totalIssues++;
    if (severity === "error") errors++;
    const item = { objectId, code, message: boundedMessage(message), severity };
    if (severity === "error") {
      const beforeWarning = issues.findIndex((entry) => entry.severity === "warning");
      if (beforeWarning >= 0) issues.splice(beforeWarning, 0, item);
      else if (issues.length < 100) issues.push(item);
      if (issues.length > 100) issues.pop();
    } else if (issues.length < 100) issues.push(item);
  }
  const fps = clip.fps * options.subdivisions,
    sourceFrames = clip.frames * options.subdivisions,
    frames = sourceFrames * (clip.mode === "ping-pong" ? 2 : 1) + (clip.mode === "once" ? 1 : 0);
  if (fps > 240 || frames > 1200)
    issue(
      null,
      "samples",
      "Perfil Lottie limitado a 240 FPS e 1200 quadros de saída; reduza duração/subdivisões.",
    );
  if (!Number.isInteger(compiled.scene.viewBox[2]) || !Number.isInteger(compiled.scene.viewBox[3]))
    issue(null, "dimensions", "Este perfil Lottie requer largura e altura inteiras da prancheta.");
  if (board.layout)
    issue(
      null,
      "layout",
      "Layout responsivo requer HTML/React; este perfil não gera posições fictícias de layout.",
    );
  let losesSemantics = false;
  for (const scope of compiled.playback.rigScopes ?? [])
    for (const trim of scope.rig.trims ?? [])
      issue(
        trim.targetId,
        "trim",
        "Trim paths ainda não têm representação Lottie homologada; use HTML/React. O recorte não será descartado.",
      );
  for (const { node } of entries) {
    try {
      svgOpacity(node.attrs.opacity);
    } catch {
      issue(node.id, "opacity", "Opacidade do objeto fora do perfil Lottie.");
    }
    if (node.semantics) losesSemantics = true;
    if (node.effects)
      issue(
        node.id,
        "effects",
        "Recortes/máscaras não estão no perfil Lottie inicial; não são descartados.",
      );
    if (node.tag === "svg")
      issue(node.id, "component", "Viewports/componentes não estão no perfil Lottie inicial.");
    else if (node.tag !== "g" && !PATH_TAGS.has(node.tag))
      issue(
        node.id,
        "content",
        "Este perfil Lottie aceita grupos e geometria vetorial, não texto/imagens.",
      );
    for (const attribute of ["display", "visibility"] as const)
      if (
        node.attrs[attribute] !== undefined &&
        !(
          attribute === "display"
            ? ["none", "inline", "inherit"]
            : ["visible", "hidden", "collapse", "inherit"]
        ).includes(node.attrs[attribute])
      )
        issue(node.id, "presentation", `Valor de ${attribute} fora do perfil Lottie.`);
    if (!PATH_TAGS.has(node.tag)) continue;
    if (node.tag === "path" && !node.attrs.d?.trim()) continue;
    try {
      const appearance = paintOf.appearance(node),
        gradients = paintOf.gradients(node),
        geometry = parseGeometry(pathFromNode(node));
      if (gradients.stroke)
        throw new Error(
          "Contorno com gradiente ainda não está no perfil Lottie homologado; a pintura não será substituída por cor sólida.",
        );
      const stroke = prepareLottieStroke(appearance);
      if (
        stroke &&
        (node.tag !== "path" ||
          /[lhvqat]/i.test(node.attrs.d ?? "") ||
          geometry.some((contour) => {
            if (contour.points.length < 2) return true;
            const segments = contour.points.length - (contour.closed ? 0 : 1);
            for (let index = 0; index < segments; index++) {
              const current = contour.points[index],
                next = contour.points[(index + 1) % contour.points.length];
              if (!current?.out || !next?.in) return true;
            }
            return false;
          }))
      )
        throw new Error(
          "Contorno Lottie inicial requer caminho Bézier cúbico explícito. Converter segmentos retos/primitivas para cúbicas altera bordas no renderer; esse perfil ainda não está homologado.",
        );
      if (stroke) {
        const dashWork = lottieDashWork(geometry, stroke.dashes);
        strokes.set(node.id, stroke);
        strokeGeometryWork +=
          dashWork +
          geometry.reduce(
            (sum, contour) =>
              sum +
              contour.points.reduce(
                (count, point) => count + 1 + (point.in ? 1 : 0) + (point.out ? 1 : 0),
                0,
              ),
            0,
          );
      }
      if ((gradients.fill || appearance.fill !== "none") && node.tag !== "line") {
        const rule = appearance["fill-rule"] ?? "nonzero";
        if (rule !== "nonzero" && rule !== "evenodd")
          throw new Error("Regra de preenchimento fora do perfil Lottie.");
        if (gradients.fill) {
          if (
            gradients.fill.units === "objectBoundingBox" &&
            (node.tag !== "path" ||
              /[lhvqat]/i.test(node.attrs.d ?? "") ||
              hasNativeStraightSegments(geometry))
          )
            throw new Error(
              "Gradiente relativo Lottie requer segmentos cúbicos na fonte: o consumidor reescreve linhas e pode mudar bordas/alpha. Use Editar vértices e a conversão cúbica com prévia/consentimento, ou exporte HTML/React. A fonte não será convertida automaticamente.",
            );
          paints.set(
            node.id,
            (gradients.fill.units === "objectBoundingBox"
              ? prepareRelativeGradient
              : prepareLottieGradient)(
              gradients.fill,
              svgOpacity(appearance["fill-opacity"]) * 100,
              rule === "evenodd" ? 2 : 1,
            ),
          );
          if (gradients.fill.units === "objectBoundingBox")
            relativeVertices += geometry.reduce(
              (count, contour) => count + contour.points.length,
              0,
            );
        } else {
          const color = parseSolidSvgColor(appearance.fill ?? "#000000"),
            hex = color.color;
          paints.set(node.id, {
            ty: "fl",
            nm: "Preenchimento",
            c: {
              a: 0,
              k: [
                Number.parseInt(hex.slice(1, 3), 16) / 255,
                Number.parseInt(hex.slice(3, 5), 16) / 255,
                Number.parseInt(hex.slice(5, 7), 16) / 255,
                1,
              ],
            },
            o: { a: 0, k: color.alpha * svgOpacity(appearance["fill-opacity"]) * 100 },
            r: rule === "evenodd" ? 2 : 1,
            bm: 0,
          });
        }
      }
      if (!paints.has(node.id) && !strokes.has(node.id)) continue;
      geometries.set(node.id, geometry);
      vertices += geometry.reduce((count, contour) => count + contour.points.length, 0);
      if (
        node.tag === "circle" ||
        node.tag === "ellipse" ||
        (node.tag === "rect" && (Number(node.attrs.rx) > 0 || Number(node.attrs.ry) > 0)) ||
        (node.tag === "path" && /[aA]/.test(node.attrs.d ?? ""))
      )
        issue(
          node.id,
          "elliptic-conversion",
          "Curvas elípticas usam a conversão Bézier do editor; não se declara igualdade contínua com arco SVG nativo.",
          "warning",
        );
    } catch (error) {
      issue(
        node.id,
        "geometry-paint",
        error instanceof Error ? error.message : "Geometria/pintura incompatível com Lottie.",
      );
    }
  }
  const gradientCount = [...paints.values()].filter((paint) => paint.ty !== "fl").length,
    localPaintSpace = strokes.size > 0 || gradientCount > 0;
  // Output is document/layers/shapes, then two gr/it boundaries per authored
  // level. An animated path's ks/k/key/s/shape/v/point/value reaches depth 16
  // at authored depth zero. Reserve that worst case without raising the
  // writer's limit or flattening away authored paint/opacity boundaries.
  const maximumPaintDepth = Math.floor((LOTTIE_JSON_MAX_DEPTH - 16) / 4);
  if (localPaintSpace && entries.some((entry) => entry.depth > maximumPaintDepth))
    issue(
      null,
      "hierarchy",
      `Hierarquia Lottie com pintura local excede a profundidade ${maximumPaintDepth}; a expansão de grupos/chaves ultrapassaria o limite estrutural JSON. Use HTML/React ou reorganize a autoria explicitamente.`,
    );
  if (
    (frames + 1) *
      (vertices * (localPaintSpace ? 12 : 6) +
        entries.length * (localPaintSpace ? 5 : 2) +
        strokeGeometryWork +
        strokes.size * 3 +
        relativeVertices * GEOMETRY_BOUNDS_VERTEX_COST +
        gradientCount * LOTTIE_GRADIENT_SAMPLE_COST) >
    2_000_000
  )
    issue(
      null,
      "cost",
      "Geometria × quadros excede orçamento de amostragem Lottie; nenhuma saída parcial será criada.",
    );
  const requiresAnimationOnlyConsent =
    losesSemantics || requiresInteractiveExport(project, board.id);
  if (gradientCount)
    issue(
      null,
      "gradient-profile",
      "Preenchimentos em gradiente usam pad e offsets em porcentagens inteiras; linear aceita userSpaceOnUse/objectBoundingBox, radial apenas userSpaceOnUse conforme. Confira cores, alpha e precisão no arquivo exportado.",
      "warning",
    );
  if (requiresAnimationOnlyConsent)
    issue(
      null,
      "animation-only",
      "Lottie contém animação, não lógica, dados, eventos, áudio, semântica ou layout responsivo; confirme a conversão.",
      "warning",
    );
  issue(
    null,
    "renderer-precision",
    "Renderizadores Lottie podem quantizar geometria e matrizes em float32; curvas e bordas podem diferir até nos quadros amostrados. Não há garantia de identidade de pixels. Confira o arquivo no consumidor e confirme essa limitação.",
    "warning",
  );
  issue(
    null,
    "sampling",
    "Poses são amostradas; a interpolação entre amostras não certifica igualdade contínua de curvas, rig ou movimento.",
    "warning",
  );
  if (clip.mode === "once")
    issue(
      null,
      "final-frame",
      "A saída inclui um quadro final de retenção para representar a pose inclusiva do editor; duração aumenta em 1/FPS de saída.",
      "warning",
    );
  if (clip.mode !== "once")
    issue(
      null,
      "loop-policy",
      "O arquivo contém um ciclo; o consumidor Lottie deve configurar a repetição. Ping-pong é convertido em ida e volta.",
      "warning",
    );
  const report: LottieReport = {
    supported: !errors,
    issues,
    omitted: totalIssues - issues.length,
    frames,
    fps,
    requiresSamplingConsent: true,
    requiresRendererPrecisionConsent: true,
    requiresAnimationOnlyConsent,
  };
  return {
    project,
    options,
    board,
    clip,
    compiled,
    entries,
    geometries,
    paints,
    strokes,
    localPaintSpace,
    sourceFrames,
    report,
  };
}
export function inspectLottieCompatibility(project: unknown, options: unknown): LottieReport {
  const prepared = prepareLottie(project, options);
  if (!prepared.report.supported || !prepared.localPaintSpace) return prepared.report;
  try {
    visitLottieSamples(prepared, { remaining: 2_000_000 }, () => {});
    return prepared.report;
  } catch (error) {
    return failedLottieReport(prepared.report, error);
  }
}
function boundedMessage(message: string) {
  return message.length <= 2000 ? message : `${message.slice(0, 1950)} [diagnóstico abreviado]`;
}
export function failedLottieReport(report: LottieReport, error: unknown): LottieReport {
  const issue: LottieIssue = {
    objectId: error instanceof LottieSampleError ? error.objectId : null,
    code: "sample-profile",
    severity: "error",
    message: boundedMessage(error instanceof Error ? error.message : "Falha na avaliação Lottie."),
  };
  return {
    ...report,
    supported: false,
    issues: [issue, ...report.issues].slice(0, 100),
    omitted: report.omitted + (report.issues.length >= 100 ? 1 : 0),
  };
}
