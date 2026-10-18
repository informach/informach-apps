/** XML 1.0 character data, including supplementary Unicode. */
export function isXmlText(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (
      code === undefined ||
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    )
      return false;
  }
  return true;
}
