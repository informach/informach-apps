export type RtfToken =
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "text"; bytes: Uint8Array }
  | { kind: "binary"; bytes: Uint8Array }
  | { kind: "byte"; value: number }
  | { kind: "symbol"; value: string }
  | { kind: "word"; name: string; value?: number };
const letter = (value: number | undefined) =>
  value !== undefined && ((value >= 65 && value <= 90) || (value >= 97 && value <= 122));
const digit = (value: number | undefined) => value !== undefined && value >= 48 && value <= 57;

/** Byte-oriented RTF lexer. Binary groups never participate in brace/control parsing. */
export function* rtfTokens(bytes: Uint8Array): Generator<RtfToken> {
  if (
    bytes.length < 7 ||
    bytes.length > 64 * 1024 * 1024 ||
    new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "{\\rtf"
  )
    throw new Error("RTF incompleto, inválido ou acima de 64 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0,
    count = 0;
  while (at < bytes.length) {
    if (++count > 2_000_000) throw new Error("O RTF excede o limite local de tokens.");
    const value = view.getUint8(at++);
    if (value === 123 || value === 125) {
      yield { kind: value === 123 ? "open" : "close" };
      continue;
    }
    if (value !== 92) {
      const start = at - 1;
      while (at < bytes.length && ![92, 123, 125].includes(view.getUint8(at))) at++;
      yield { kind: "text", bytes: bytes.subarray(start, at) };
      continue;
    }
    if (at >= bytes.length) throw new Error("Controle RTF incompleto.");
    const next = view.getUint8(at++);
    if (next === 39) {
      if (at + 2 > bytes.length) throw new Error("Escape hexadecimal RTF incompleto.");
      const hex = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1));
      if (!/^[a-f\d]{2}$/i.test(hex)) throw new Error("Escape hexadecimal RTF inválido.");
      at += 2;
      yield { kind: "byte", value: Number.parseInt(hex, 16) };
      continue;
    }
    if (!letter(next)) {
      yield { kind: "symbol", value: String.fromCharCode(next) };
      continue;
    }
    let name = String.fromCharCode(next);
    while (letter(bytes[at])) {
      name += String.fromCharCode(view.getUint8(at++));
      if (name.length > 32) throw new Error("Palavra de controle RTF acima de 32 letras.");
    }
    let sign = 1,
      parameter: number | undefined;
    if (bytes[at] === 45 && digit(bytes[at + 1])) {
      sign = -1;
      at++;
    }
    const start = at;
    while (digit(bytes[at])) {
      at++;
      if (at - start > 10) throw new Error("Parâmetro RTF grande demais.");
    }
    if (at > start) {
      parameter = sign * Number(new TextDecoder("ascii").decode(bytes.subarray(start, at)));
      if (!Number.isSafeInteger(parameter) || parameter < -2147483648 || parameter > 2147483647)
        throw new Error("Parâmetro RTF fora dos limites locais.");
    }
    if (bytes[at] === 32) at++;
    if (name === "bin") {
      if (
        parameter === undefined ||
        parameter < 0 ||
        parameter > 32 * 1024 * 1024 ||
        at + parameter > bytes.length
      )
        throw new Error("Bloco binário RTF incompleto ou acima de 32 MB.");
      yield { kind: "binary", bytes: bytes.subarray(at, at + parameter) };
      at += parameter;
    } else yield { kind: "word", name, ...(parameter === undefined ? {} : { value: parameter }) };
  }
}
