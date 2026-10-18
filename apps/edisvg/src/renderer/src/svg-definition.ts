/** Shared strict definition boundary; never enables these attributes on
 * ordinary authored SVG nodes or permits a resource URL to escape its parser. */
export function assertSvgDefinitionAttributes(element: Element, allowed: ReadonlySet<string>) {
  const namespace = "http://www.w3.org/2000/svg";
  if (element.namespaceURI && element.namespaceURI !== namespace)
    throw new Error("Namespace de definição SVG não suportado.");
  for (const attr of element.attributes) {
    if (attr.name === "xmlns" || attr.name.startsWith("xmlns:")) continue;
    if (
      attr.name === "xlink:href" &&
      attr.namespaceURI === "http://www.w3.org/1999/xlink" &&
      allowed.has("href")
    )
      continue;
    if ((attr.namespaceURI && attr.namespaceURI !== namespace) || !allowed.has(attr.name))
      throw new Error(`Atributo de definição SVG não suportado: ${attr.name.slice(0, 80)}.`);
  }
}
