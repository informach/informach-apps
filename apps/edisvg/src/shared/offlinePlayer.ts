import { frameAt, poseAt, transition } from "./animation.js";
import { mountPresetPlayer, type PresetPlayerConfig } from "./presetPlayer";

export {
  createInteractiveSvgPlayer,
  createInteractiveSvgPlayerAsync,
  createSvgPlayer,
  createVisualSvgPlayerAsync,
} from "@informach/edi-motion/runtime";
export { mountClipPlayer } from "./clipPlayer";
export { mountInteractivePlayer } from "./interactivePlayer";
/** Bundled entry, not function source serialization. Build tools may freely
 * minify/rename helpers without changing standalone HTML behavior. */
export function mountLegacyPlayer(config: PresetPlayerConfig) {
  mountPresetPlayer(config, frameAt, poseAt, transition);
}
