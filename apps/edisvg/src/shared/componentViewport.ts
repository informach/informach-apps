import type { ComponentInstance } from "./componentContracts";
import type { Scene } from "./sceneTypes";
export function componentViewport(
  instance: ComponentInstance,
  scene: Scene,
): Record<string, string> {
  return {
    x: "0",
    y: "0",
    width: String(instance.width),
    height: String(instance.height),
    viewBox: scene.viewBox.join(" "),
    preserveAspectRatio:
      instance.fit === "stretch"
        ? "none"
        : `xMidYMid ${instance.fit === "cover" ? "slice" : "meet"}`,
    overflow: "hidden",
  };
}
