import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * PIN da área dos pais no aparelho da criança.
 *
 * Fica só como `scrypt` com sal próprio, nunca em texto. Um PIN de 4 a 6
 * dígitos tem pouca entropia: o que segura uma criança insistente é o limite
 * de tentativas por aparelho (ver `PIN_TENTATIVAS`), não o hash sozinho.
 *
 * O protótipo aceitava PIN vazio e liberava a área dos pais sem pedir nada;
 * aqui o formato é conferido na entrada e na verificação.
 */
export const pinSchema = z.string().regex(/^\d{4,6}$/, "O PIN tem de 4 a 6 números.");
export const PIN_TENTATIVAS = 5;
export const PIN_JANELA_MS = 15 * 60_000;
/** Quanto tempo a área dos pais fica aberta no aparelho da criança depois do PIN. */
export const DESBLOQUEIO_MS = 10 * 60_000;

const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const TAMANHO = 32;

function derivar(pin: string, sal: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(pin, sal, TAMANHO, PARAMETROS, (erro, chave) => (erro ? reject(erro) : resolve(chave))),
  );
}

export async function gerarHashDoPin(pin: string) {
  const valido = pinSchema.parse(pin);
  const sal = randomBytes(16);
  const chave = await derivar(valido, sal);
  return `scrypt$${sal.toString("base64url")}$${chave.toString("base64url")}`;
}

export async function conferirPin(pin: string, guardado: string | null | undefined) {
  if (!guardado || !pinSchema.safeParse(pin).success) return false;
  const [tipo, sal, hash] = guardado.split("$");
  if (tipo !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64url");
  const recebido = await derivar(pin, Buffer.from(sal, "base64url"));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const assinatura = (segredo: string, dados: string) =>
  createHmac("sha256", segredo).update(`estrela-pin:${dados}`).digest("base64url");

/** A new PIN generation invalidates every prior short-lived unlock without revoking devices. */
export function emitirDesbloqueio(
  segredo: string,
  deviceId: string,
  pinGeneration: string,
  agora = Date.now(),
) {
  const expira = agora + DESBLOQUEIO_MS;
  const dados = `v2.${deviceId}.${pinGeneration}.${expira}`;
  return { valor: `${dados}.${assinatura(segredo, dados)}`, expira };
}
export function lerDesbloqueio(
  segredo: string,
  valor: string | undefined,
  deviceId: string,
  pinGeneration: string,
  agora = Date.now(),
) {
  if (!valor) return null;
  const parts = valor.split(".");
  const [version, aparelho, generation, expiry, signature] = parts;
  const expires = Number(expiry);
  if (
    parts.length !== 5 ||
    version !== "v2" ||
    aparelho !== deviceId ||
    generation !== pinGeneration ||
    !signature ||
    !Number.isSafeInteger(expires) ||
    expires <= agora ||
    expires > agora + DESBLOQUEIO_MS
  )
    return null;
  const expected = Buffer.from(
    assinatura(segredo, `${version}.${aparelho}.${generation}.${expiry}`),
  );
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? expires
    : null;
}
