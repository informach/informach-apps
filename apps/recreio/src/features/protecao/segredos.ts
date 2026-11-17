import "server-only";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const PinSchema = z.string().regex(/^\d{6}$/);
export const SegredoDeAparelhoSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((s) => {
    const bytes = Buffer.from(s, "base64url");
    return bytes.length === 32 && bytes.toString("base64url") === s;
  });
export const CodigoDePareamentoSchema = z.string().regex(/^[A-F0-9]{10}$/);
const FORMATO_HASH = /^scrypt-v1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derivar(pin: string, sal: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, sal, 32, PARAMETROS, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
  });
}
export async function gerarHashDoPin(entrada: string): Promise<string> {
  const pin = PinSchema.parse(entrada);
  const sal = randomBytes(16);
  const chave = await derivar(pin, sal);
  return `scrypt-v1$${sal.toString("base64url")}$${chave.toString("base64url")}`;
}
export async function conferirPin(entrada: unknown, guardado: string | null): Promise<boolean> {
  const pedido = PinSchema.safeParse(entrada);
  const partes = guardado?.match(FORMATO_HASH);
  if (!pedido.success || !partes?.[1] || !partes[2]) return false;
  const sal = Buffer.from(partes[1], "base64url");
  const esperado = Buffer.from(partes[2], "base64url");
  if (
    sal.length !== 16 ||
    esperado.length !== 32 ||
    sal.toString("base64url") !== partes[1] ||
    esperado.toString("base64url") !== partes[2]
  )
    return false;
  return timingSafeEqual(await derivar(pedido.data, sal), esperado);
}
export function novoSegredoDeAparelho(): string {
  return randomBytes(32).toString("base64url");
}
export function hashDoSegredo(
  finalidade: "consulta" | "codigo" | "credencial",
  valor: string,
): string {
  return createHash("sha256").update(`recreio:${finalidade}:v1:${valor}`).digest("hex");
}
export function codigoDoSegredo(entrada: string): string {
  const segredo = SegredoDeAparelhoSchema.parse(entrada);
  return createHmac("sha256", Buffer.from(segredo, "base64url"))
    .update("recreio:codigo:v1")
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}
/** Recuperar a resposta perdida não cria outro segredo ou amplia sua validade. */
export function credencialDoSegredo(entrada: string, aparelhoId: string): string {
  const segredo = SegredoDeAparelhoSchema.parse(entrada);
  const token = createHmac("sha256", Buffer.from(segredo, "base64url"))
    .update(`recreio:pareado:v1:${aparelhoId}`)
    .digest("base64url");
  return `${aparelhoId}.${token}`;
}
