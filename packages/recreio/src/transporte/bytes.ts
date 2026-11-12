/**
 * Bytes no transporte HTTP. Só usa o que existe no navegador e no Node
 * (`btoa`, `atob`, `TextEncoder`), para servir ao SDK e ao cliente das
 * instâncias sem depender de `Buffer`.
 */

const PEDACO = 0x8000;

export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let inicio = 0; inicio < bytes.length; inicio += PEDACO) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + PEDACO));
  }
  return btoa(binario);
}

export function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Um objeto JSON num valor de cabeçalho: UTF-8 em base64url, sem preenchimento. */
export function jsonParaCabecalho(valor: unknown): string {
  return bytesParaBase64(new TextEncoder().encode(JSON.stringify(valor)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** O inverso de `jsonParaCabecalho`. Devolve `undefined` se o valor não for JSON em base64url. */
export function cabecalhoParaJson(valor: string): unknown {
  if (!/^[A-Za-z0-9_-]*$/.test(valor)) return undefined;
  try {
    const base64 = valor.replaceAll("-", "+").replaceAll("_", "/");
    const preenchido = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(base64ParaBytes(preenchido)),
    );
  } catch {
    return undefined;
  }
}
