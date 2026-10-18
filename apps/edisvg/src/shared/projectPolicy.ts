export const PROJECT_BYTES = 8_000_000;

/** Transactions and file writes use the same serialized UTF-8 budget. */
export function serializeProject(project: unknown): string {
  // A lower-bound preflight prevents repeated large strings from producing an
  // enormous intermediate JSON allocation. The exact pretty-print budget below
  // remains authoritative, including escapes, keys and indentation.
  const encoder = new TextEncoder(),
    ancestors = new Set<object>();
  let textBytes = 0,
    work = 0;
  function inspect(value: unknown, depth: number) {
    if (++work > 1000000 || depth > 128)
      throw new Error("Projeto excede o orçamento de serialização.");
    if (typeof value === "string") {
      if (value.length > PROJECT_BYTES - textBytes)
        throw new Error("Projeto muito grande para salvar. Reduza a complexidade da cena.");
      textBytes += encoder.encode(value).byteLength;
      if (textBytes > PROJECT_BYTES)
        throw new Error("Projeto muito grande para salvar. Reduza a complexidade da cena.");
    } else if (typeof value === "object" && value !== null) {
      if (ancestors.has(value)) throw new Error("Projeto contém uma referência circular.");
      ancestors.add(value);
      if (Array.isArray(value)) {
        for (const child of value) inspect(child, depth + 1);
      } else
        for (const [key, child] of Object.entries(value)) {
          if (child === undefined || typeof child === "function" || typeof child === "symbol")
            continue;
          inspect(key, depth + 1);
          inspect(child, depth + 1);
        }
      ancestors.delete(value);
    }
  }
  inspect(project, 0);
  const content = JSON.stringify(project, null, 2);
  if (typeof content !== "string" || encoder.encode(content).byteLength > PROJECT_BYTES)
    throw new Error("Projeto muito grande para salvar. Reduza a complexidade da cena.");
  return content;
}
