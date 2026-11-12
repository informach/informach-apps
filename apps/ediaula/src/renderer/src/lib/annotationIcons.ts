import type { AnnotationIcon } from "@shared/annotation";
import {
  Check,
  CircleHelp,
  Clock,
  Code,
  Compass,
  Flag,
  Flame,
  Gamepad2,
  KeyRound,
  Lightbulb,
  type LucideIcon,
  Pause,
  Pencil,
  Play,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** The lucide drawing of each annotation icon (the same ones the editor shows in its pickers). */
export const ICON_COMPONENTS: Record<AnnotationIcon, LucideIcon> = {
  pause: Pause,
  play: Play,
  check: Check,
  sparkles: Sparkles,
  star: Star,
  flag: Flag,
  gamepad: Gamepad2,
  key: KeyRound,
  clock: Clock,
  flame: Flame,
  compass: Compass,
  lightbulb: Lightbulb,
  target: Target,
  rocket: Rocket,
  trophy: Trophy,
  help: CircleHelp,
  code: Code,
  pencil: Pencil,
};

const loaded = new Map<string, Promise<HTMLImageElement>>();

/**
 * An icon as a picture `px` pixels wide in `color`, to be drawn into an annotation. The SVG is
 * made at that size, so the strokes stay sharp; pause and play are filled, like the kit's.
 */
export function iconImage(
  icon: AnnotationIcon,
  color: string,
  px: number,
): Promise<HTMLImageElement> {
  const size = Math.max(8, Math.round(px));
  const key = `${icon}|${color}|${size}`;
  let image = loaded.get(key);
  if (!image) {
    const filled = icon === "pause" || icon === "play";
    const svg = renderToStaticMarkup(
      createElement(ICON_COMPONENTS[icon], {
        color,
        size,
        strokeWidth: 2.5,
        ...(filled ? { fill: color } : {}),
      }),
    );
    const img = new Image(size, size);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    image = img.decode().then(() => img);
    image.catch(() => loaded.delete(key));
    loaded.set(key, image);
  }
  return image;
}
