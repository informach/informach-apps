export interface GraphicElement {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  children: readonly GraphicElement[];
}
/** Only generated, already validated descriptors belong here; never raw input. */
export function matchesGraphicElement(actual: Element, expected: GraphicElement): boolean {
  return (
    actual.namespaceURI === "http://www.w3.org/2000/svg" &&
    actual.localName === expected.tag &&
    actual.attributes.length === Object.keys(expected.attrs).length &&
    Object.entries(expected.attrs).every(([name, value]) => actual.getAttribute(name) === value) &&
    actual.children.length === expected.children.length &&
    expected.children.every((child, index) => {
      const element = actual.children[index];
      return !!element && matchesGraphicElement(element, child);
    })
  );
}
export function createGraphicElement(document: Document, descriptor: GraphicElement): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", descriptor.tag);
  for (const [name, value] of Object.entries(descriptor.attrs)) element.setAttribute(name, value);
  for (const child of descriptor.children) element.append(createGraphicElement(document, child));
  return element;
}
