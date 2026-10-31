import {
  animationControls,
  parseAnimationArtifact,
  serializeAnimationArtifact,
} from "./animationArtifact";
import { assetDataUri, decodeAssetData } from "./assets/model";
import type { WebAnimationInfo } from "./webPlayerTypes";

export type { WebAnimationInfo } from "./webPlayerTypes";
export function normalizeWebAnimation(input: unknown): string {
  return serializeAnimationArtifact(input);
}
export function readWebAnimation(input: unknown): WebAnimationInfo {
  const artifact = parseAnimationArtifact(input);
  const viewBox = artifact.document.visual?.viewBox;
  if (!viewBox) throw new Error("A animação não tem dimensão visual.");
  return {
    title: artifact.title,
    version: artifact.version,
    viewBox: [...viewBox],
    fit: artifact.fit,
    autoplay: artifact.autoplay,
    respectReducedMotion: artifact.respectReducedMotion,
    pauseOffscreen: artifact.pauseOffscreen,
    inputs: animationControls(artifact).inputs.map(({ name, kind }) => ({ name, kind })),
    machines: artifact.document.behavior.machines.map(({ name }) => name),
    events: animationControls(artifact).events,
    ...(artifact.poster
      ? {
          poster: {
            dataUri: assetDataUri(artifact.poster),
            width: artifact.poster.width,
            height: artifact.poster.height,
            bytes: artifact.poster.byteLength,
          },
        }
      : {}),
  };
}
export function webAnimationPoster(
  input: unknown,
): { bytes: Uint8Array; width: number; height: number; mime: "image/png" } | null {
  const poster = parseAnimationArtifact(input).poster;
  return poster
    ? {
        bytes: decodeAssetData(poster.data),
        width: poster.width,
        height: poster.height,
        mime: "image/png",
      }
    : null;
}
