import { identityMatrix, multiply, transformMatrix } from "@informach/edi-motion";
import type { Project } from "../project";
import type { Scene } from "../sceneTypes";
import type { ShapeLayer } from "./model";

/** Keep global paint/compositing coordinates on the layer. Normalize the
 * viewport there, not inside the opacity/paint group: equivalent geometry
 * alone does not preserve native translucent-gradient rasterization space. */
export function lottieGlobalTransform(
  transform: Project["transforms"],
  viewBox: Scene["viewBox"],
  preservePaintSpace: boolean,
) {
  const [x, y, width, height] = viewBox,
    ax = width / 2 + (transform.px ?? 0),
    ay = height / 2 + (transform.py ?? 0),
    viewportPrefix: import("@informach/edi-motion").Affine = [1, 0, 0, 1, -x, -y],
    global = transformMatrix({ ...transform, px: x + ax, py: y + ay }),
    layer: ShapeLayer["ks"] = {
      o: { a: 0, k: transform.opacity },
      r: { a: 0, k: transform.rotation },
      p: { a: 0, k: [ax + transform.x, ay + transform.y, 0] },
      a: { a: 0, k: [x + ax, y + ay, 0] },
      s: { a: 0, k: [transform.sx * 100, transform.sy * 100, 100] },
      sk: { a: 0, k: transform.skewX ? -transform.skewX : 0 },
      sa: { a: 0, k: 0 },
    };
  const fields = [
    ax,
    ay,
    x + ax,
    y + ay,
    transform.x + ax,
    transform.y + ay,
    transform.sx * 100,
    transform.sy * 100,
    transform.rotation,
    transform.skewX ?? 0,
  ];
  if (!fields.every((value) => Number.isFinite(value) && Math.abs(value) <= 1e7))
    throw new Error("Transformação global excede o perfil Lottie.");
  const worldPrefix = multiply(viewportPrefix, global);
  // Fill-only export retains the existing affine-baked profile. A stroke has
  // its own width/dash coordinate system: retain global paint space on its
  // composition layer instead of baking that space into child geometry.
  return {
    localPrefix: preservePaintSpace ? identityMatrix() : worldPrefix,
    worldPrefix,
    layer: preservePaintSpace
      ? layer
      : ({
          o: layer.o,
          r: { a: 0, k: 0 },
          p: { a: 0, k: [0, 0, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
          sk: { a: 0, k: 0 },
          sa: { a: 0, k: 0 },
        } satisfies ShapeLayer["ks"]),
  };
}
