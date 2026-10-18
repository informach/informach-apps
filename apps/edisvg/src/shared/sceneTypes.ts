import type { Affine, Transform } from "@informach/edi-motion";
import type { ImageSlice } from "@informach/edi-motion/assets";
import type { GradientPaints, VectorEffects } from "@informach/edi-motion/graphics";
import type { SemanticMetadata } from "@informach/edi-motion/visual";
import type { AppearanceStyle } from "./appearanceContracts";
import type { ComponentInstance } from "./componentContracts";
import type { TextLayout } from "./textLayout";
export interface SceneNode {
  id: string;
  name: string;
  tag:
    | "g"
    | "svg"
    | "path"
    | "rect"
    | "circle"
    | "ellipse"
    | "line"
    | "polyline"
    | "polygon"
    | "text"
    | "image";
  assetId?: string;
  imageSlice?: ImageSlice;
  gradients?: GradientPaints;
  effects?: VectorEffects;
  fontAssetId?: string;
  fontFallbackIds?: string[];
  attrs: Record<string, string>;
  text: string;
  children: SceneNode[];
  transform: Transform;
  visible: boolean;
  locked: boolean;
  /** Coordinate space retained by hierarchy edits, outside animated TRS. */
  basis?: Affine;
  instance?: ComponentInstance;
  textLayout?: TextLayout;
  semantics?: SemanticMetadata;
}
export interface Scene {
  viewBox: [number, number, number, number];
  nodes: SceneNode[];
  source?: string;
  preserveAspectRatio?: string;
  styles?: AppearanceStyle[];
  palette?: string[];
}
