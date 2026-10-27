export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

export function normalizeHex(value: string): string | null {
  const text = value.trim();
  if (/^#[\da-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(text))
    return `#${[...text.slice(1)].map((part) => part + part).join("")}`.toLowerCase();
  return null;
}

export function hexToHsv(hex: string): HsvColor {
  const color = normalizeHex(hex) ?? "#000000";
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const distance = maximum - minimum;
  let hue = 0;
  if (distance > 0) {
    if (maximum === red) hue = ((green - blue) / distance) % 6;
    else if (maximum === green) hue = (blue - red) / distance + 2;
    else hue = (red - green) / distance + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return {
    hue,
    saturation: maximum === 0 ? 0 : (distance / maximum) * 100,
    value: maximum * 100,
  };
}

export function hsvToHex({ hue, saturation, value }: HsvColor): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const v = Math.min(100, Math.max(0, value)) / 100;
  const chroma = v * s;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = v - chroma;
  const sector = Math.floor(h / 60);
  const channels = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][sector] ?? [0, 0, 0];
  return `#${channels
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
