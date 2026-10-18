export interface SvgInlineDeclaration {
  name: string;
  value: string;
  apply: boolean;
}
/** Closed inline declaration profile, not a general stylesheet parser. Every
 * declaration is returned for validation, even when an earlier important
 * declaration prevents it from replacing the effective value. */
export function parseSvgInlineStyle(
  raw: string,
  allowed: ReadonlySet<string>,
): SvgInlineDeclaration[] {
  if (typeof raw !== "string" || raw.length > 500000 || /\/\*|\*\/|[{}\\]/.test(raw))
    throw new Error("Estilo SVG fora do perfil inline limitado.");
  let separators = 0;
  for (const character of raw)
    if (character === ";" && ++separators > 256)
      throw new Error("Estilo SVG excede 256 declarações.");
  const importance = new Map<string, boolean>(),
    declarations: SvgInlineDeclaration[] = [];
  for (const part of raw.split(";")) {
    if (!part.trim()) continue;
    const colon = part.indexOf(":"),
      name = part.slice(0, colon).trim().toLowerCase();
    if (colon < 1 || !/^[a-z][a-z0-9-]{0,63}$/.test(name) || !allowed.has(name))
      throw new Error("Propriedade inline SVG não suportada.");
    const annotation = /\s*!\s*important\s*$/i.exec(part.slice(colon + 1)),
      value = (
        annotation ? part.slice(colon + 1, colon + 1 + annotation.index) : part.slice(colon + 1)
      ).trim(),
      important = annotation !== null;
    if (!value || value.includes("!")) throw new Error("Declaração inline SVG inválida.");
    const apply = importance.get(name) !== true || important;
    if (apply) importance.set(name, important);
    declarations.push({ name, value, apply });
    if (declarations.length > 256) throw new Error("Estilo SVG excede 256 declarações.");
  }
  return declarations;
}
