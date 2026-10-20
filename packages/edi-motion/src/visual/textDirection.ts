import { z } from "zod";

/** "auto" resolves the base direction from the text itself (UBA rule P2/P3), so
 * dynamic text keeps it; explicit ltr/rtl stay in the `direction` attribute. */
export const textDirectionSchema = z.literal("auto");
export type TextDirection = z.infer<typeof textDirectionSchema>;
// Strong right-to-left letters (bidi classes R/AL) by script, plus the marks.
const rightToLeft =
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Yezidi}\p{Script=Old_Hungarian}\p{Script=Phoenician}\p{Script=Imperial_Aramaic}\p{Script=Nabataean}\p{Script=Palmyrene}\p{Script=Hatran}\p{Script=Kharoshthi}\p{Script=Avestan}\p{Script=Old_South_Arabian}\p{Script=Old_North_Arabian}\p{Script=Old_Turkic}\p{Script=Inscriptional_Parthian}\p{Script=Inscriptional_Pahlavi}\p{Script=Psalter_Pahlavi}\p{Script=Manichaean}\p{Script=Lydian}\p{Script=Cypriot}\p{Script=Meroitic_Cursive}\p{Script=Meroitic_Hieroglyphs}\p{Script=Sogdian}\p{Script=Old_Sogdian}\p{Script=Elymaic}\p{Script=Chorasmian}]/u,
  letter = /\p{L}/u;
/** The first strong character outside isolates decides; neutral text is ltr. */
export function resolveTextDirection(text: string): "ltr" | "rtl" {
  let isolated = 0;
  for (const character of text) {
    if (character === "\u2066" || character === "\u2067" || character === "\u2068") isolated++;
    else if (character === "\u2069") isolated = Math.max(0, isolated - 1);
    else if (isolated) continue;
    else if (character === "\u200e") return "ltr";
    else if (character === "\u200f" || character === "\u061c") return "rtl";
    else if (letter.test(character)) return rightToLeft.test(character) ? "rtl" : "ltr";
  }
  return "ltr";
}
