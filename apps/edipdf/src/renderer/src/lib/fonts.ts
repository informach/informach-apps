import type { UnicodeFonts } from "@shared/unicode-fonts";
import boldUrl from "../../../../resources/fonts/NotoSans-Bold.ttf?url";
import boldItalicUrl from "../../../../resources/fonts/NotoSans-BoldItalic.ttf?url";
import italicUrl from "../../../../resources/fonts/NotoSans-Italic.ttf?url";
import regularUrl from "../../../../resources/fonts/NotoSans-Regular.ttf?url";

let fonts: Promise<UnicodeFonts> | undefined;
export function localFonts(): Promise<UnicodeFonts> {
  fonts ??= Promise.all(
    [regularUrl, boldUrl, italicUrl, boldItalicUrl].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Não foi possível carregar as fontes locais.");
      return new Uint8Array(await response.arrayBuffer());
    }),
  ).then(([regular, bold, italic, boldItalic]) => ({ regular, bold, italic, boldItalic }));
  return fonts;
}
