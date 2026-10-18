export type Vector2 = [number, number];
export type Vector3 = [number, number, number];
export interface StaticProperty<T> {
  a: 0;
  k: T;
}
export interface EasingHandle {
  x: [number];
  y: [number];
}
export interface ScalarKeyframe {
  t: number;
  s: [number];
  i?: EasingHandle;
  o?: EasingHandle;
  h?: 1;
}
export type ScalarProperty = StaticProperty<number> | { a: 1; k: ScalarKeyframe[] };
export interface VectorKeyframe {
  t: number;
  s: Vector2;
  i?: EasingHandle;
  o?: EasingHandle;
  h?: 1;
}
export type VectorProperty = StaticProperty<Vector2> | { a: 1; k: VectorKeyframe[] };
export interface BezierShape {
  v: Vector2[];
  i: Vector2[];
  o: Vector2[];
  c: boolean;
}
export interface ShapeKeyframe {
  t: number;
  s: [BezierShape];
  i?: EasingHandle;
  o?: EasingHandle;
  h?: 1;
}
export type ShapeProperty = StaticProperty<BezierShape> | { a: 1; k: ShapeKeyframe[] };
export interface ShapePath {
  ty: "sh";
  nm: string;
  ks: ShapeProperty;
}
export interface ShapeFill {
  ty: "fl";
  nm: string;
  c: StaticProperty<[number, number, number, number]>;
  o: StaticProperty<number>;
  r: 1 | 2;
  bm: 0;
}
export interface ShapeGradientFill {
  ty: "gf";
  nm: string;
  g: { p: number; k: StaticProperty<number[]> };
  s: VectorProperty;
  e: VectorProperty;
  t: 1 | 2;
  h: StaticProperty<number>;
  a: StaticProperty<number>;
  o: ScalarProperty;
  r: 1 | 2;
  bm: 0;
}
export interface StaticShapeGradientFill extends ShapeGradientFill {
  s: StaticProperty<Vector2>;
  e: StaticProperty<Vector2>;
  o: StaticProperty<number>;
}
export interface ShapeTransform {
  ty: "tr";
  p: VectorProperty;
  a: StaticProperty<Vector2>;
  s: VectorProperty;
  r: ScalarProperty;
  o: ScalarProperty;
}
export interface StrokeDash {
  n: "d" | "g" | "o";
  v: StaticProperty<number>;
}
export interface ShapeStroke {
  ty: "st";
  nm: string;
  c: StaticProperty<[number, number, number, number]>;
  o: StaticProperty<number>;
  w: ScalarProperty;
  lc: 1 | 2 | 3;
  lj: 1 | 2 | 3;
  ml: 4;
  d?: StrokeDash[];
  bm: 0;
}
export interface ShapeGroup {
  ty: "gr";
  nm: string;
  it: ShapeElement[];
}
export type ShapeElement =
  | ShapePath
  | ShapeFill
  | ShapeGradientFill
  | ShapeStroke
  | ShapeTransform
  | ShapeGroup;
export interface ShapeLayer {
  ty: 4;
  ind: number;
  nm: string;
  ip: 0;
  op: number;
  st: 0;
  sr: 1;
  ddd: 0;
  ao: 0;
  bm: 0;
  ks: {
    o: ScalarProperty;
    r: StaticProperty<number>;
    p: StaticProperty<Vector3>;
    a: StaticProperty<Vector3>;
    s: StaticProperty<Vector3>;
    sk: StaticProperty<number>;
    sa: StaticProperty<number>;
  };
  shapes: ShapeElement[];
}
/** This emitter's closed vector profile, not a parser for arbitrary Lottie. */
export interface LottieDocument {
  v: "5.13.0";
  ver: 10000;
  nm: string;
  fr: number;
  ip: 0;
  op: number;
  w: number;
  h: number;
  ddd: 0;
  assets: [];
  layers: ShapeLayer[];
  meta: { g: "EdiSVG"; sampling: string };
}
export interface LottieIssue {
  objectId: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
}
export interface LottieReport {
  supported: boolean;
  issues: LottieIssue[];
  omitted: number;
  frames: number;
  fps: number;
  requiresSamplingConsent: boolean;
  requiresRendererPrecisionConsent: boolean;
  requiresAnimationOnlyConsent: boolean;
}
