/** Explicit reads return exact JSON in bounded character chunks. Never use a
 * preview as the payload for a document replacement. */
export function inspectJsonChunk(id: string, value: unknown, offset: number) {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("Valor de inspeção não serializável.");
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length)
    throw new Error("Offset além do valor atual.");
  return {
    id,
    encoding: "json" as const,
    totalCharacters: text.length,
    offset,
    value: text.slice(offset, offset + 20000),
    nextOffset: offset + 20000 < text.length ? offset + 20000 : null,
  };
}
