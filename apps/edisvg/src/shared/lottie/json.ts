/** Compact JSON with an exact UTF-8 budget before constructing the final
 * string. No getters/prototypes, cycles, non-finite values or silent omission. */
export const LOTTIE_JSON_MAX_DEPTH = 128;
export function stringifyLottieJson(value: unknown, maximum = 8_000_000): string {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 8_000_000)
    throw new Error("Orçamento JSON Lottie inválido.");
  const parts: string[] = [],
    ancestors = new Set<object>();
  let bytes = 0,
    work = 0;
  function append(text: string, size = text.length) {
    bytes += size;
    if (bytes > maximum) throw new Error("Lottie excede o limite de bytes da exportação.");
    parts.push(text);
  }
  function string(text: string) {
    let size = 2;
    if (text.length > maximum - bytes) throw new Error("Texto Lottie excede o limite de bytes.");
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) size += 2;
      else if (code < 32) size += 6;
      else if (code < 128) size++;
      else if (code < 2048) size += 2;
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        text.charCodeAt(index + 1) >= 0xdc00 &&
        text.charCodeAt(index + 1) <= 0xdfff
      ) {
        size += 4;
        index++;
      } else if (code >= 0xd800 && code <= 0xdfff) size += 6;
      else size += 3;
      if (size > maximum - bytes) throw new Error("Texto Lottie excede o limite de bytes.");
    }
    append(JSON.stringify(text), size);
  }
  function visit(input: unknown, depth: number) {
    if (++work > 1_000_000 || depth > LOTTIE_JSON_MAX_DEPTH)
      throw new Error("Lottie excede orçamento estrutural JSON.");
    if (typeof input === "string") string(input);
    else if (input === null) append("null");
    else if (typeof input === "boolean") append(String(input));
    else if (typeof input === "number") {
      if (!Number.isFinite(input)) throw new Error("Lottie contém número não finito.");
      append(JSON.stringify(input));
    } else if (typeof input === "object") {
      if (ancestors.has(input)) throw new Error("Lottie contém ciclo JSON.");
      ancestors.add(input);
      if (Array.isArray(input)) {
        if (
          Object.getPrototypeOf(input) !== Array.prototype ||
          input.length > 1_000_000 - work ||
          Object.getOwnPropertyNames(input).length !== input.length + 1 ||
          Object.getOwnPropertySymbols(input).length
        )
          throw new Error("Array Lottie fora do perfil JSON.");
        append("[");
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (!descriptor || !Object.hasOwn(descriptor, "value"))
            throw new Error("Array Lottie não aceita lacunas/getters.");
          if (index) append(",");
          visit(descriptor.value, depth + 1);
        }
        append("]");
      } else {
        if (
          Object.getPrototypeOf(input) !== Object.prototype &&
          Object.getPrototypeOf(input) !== null
        )
          throw new Error("Lottie requer objetos JSON simples.");
        const descriptors = Object.getOwnPropertyDescriptors(input),
          keys = Object.keys(descriptors);
        if (keys.length > 1000 || Object.getOwnPropertySymbols(input).length)
          throw new Error("Objeto Lottie fora do perfil JSON.");
        append("{");
        for (const [index, key] of keys.entries()) {
          const descriptor = descriptors[key];
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
            throw new Error("Objeto Lottie não aceita propriedades ocultas/getters.");
          if (index) append(",");
          string(key);
          append(":");
          visit(descriptor.value, depth + 1);
        }
        append("}");
      }
      ancestors.delete(input);
    } else throw new Error("Lottie contém valor não serializável.");
  }
  visit(value, 0);
  return parts.join("");
}
