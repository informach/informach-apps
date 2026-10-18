import { assetDataUri, assetFontFamily, type FontAsset, parseAsset } from "./model";
/** Generated family names and validated Base64 only; author names, notices,
 * paths and arbitrary URLs never become stylesheet tokens. */
export function fontAssetCss(input: FontAsset) {
  const font = parseAsset(input);
  if (font.kind !== "font") throw new Error("Recurso de fonte esperado.");
  return `@font-face{font-family:"${assetFontFamily(font)}";src:url("${assetDataUri(font)}") format("${font.format}");font-weight:${font.weight};font-style:${font.italic ? "italic" : "normal"};font-display:block;}`;
}
