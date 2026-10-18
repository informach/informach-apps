import { strToU8 } from "fflate";
import type { UnicodeFonts } from "../unicode-fonts.ts";

export function openDocumentFonts(fonts: UnicodeFonts, license: string) {
  if (license.length < 100 || license.length > 100000)
    throw new Error("Licença de fonte OpenDocument indisponível.");
  const keys: (keyof UnicodeFonts)[] = ["regular", "bold", "italic", "boldItalic"],
    parts: Record<string, Uint8Array> = {},
    media = new Map<string, string>();
  const faces = keys
    .map((key) => {
      const font = fonts[key];
      if (!font || font.length < 32 || font.length > 32 * 1024 * 1024)
        throw new Error("Fonte local OpenDocument indisponível/inválida.");
      const path = `Fonts/${key}.ttf`;
      parts[path] = font;
      media.set(path, "application/x-font-ttf");
      return `<style:font-face style:name="Noto-${key}" svg:font-family="'Noto Sans'" style:font-family-generic="swiss" style:font-pitch="variable"><svg:font-face-src><svg:font-face-uri xlink:href="${path}" xlink:type="simple"><svg:font-face-format svg:string="truetype"/></svg:font-face-uri></svg:font-face-src></style:font-face>`;
    })
    .join("");
  parts["Fonts/OFL.txt"] = strToU8(license);
  media.set("Fonts/OFL.txt", "text/plain");
  return { faces, parts, media };
}
