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

/** Ficha de desbloqueio: presa ao aparelho e com prazo curto. */
export function emitirDesbloqueio(segredo: string, deviceId: string, agora = Date.now()) {
  const expira = agora + DESBLOQUEIO_MS;
  return { valor: `${deviceId}.${expira}.${assinatura(segredo, `${deviceId}.${expira}`)}`, expira };
}

export function lerDesbloqueio(
  segredo: string,
  valor: string | undefined,
  deviceId: string,
  agora = Date.now(),
) {
  if (!valor) return null;
  const [aparelho, expira, recebida] = valor.split(".");
  if (aparelho !== deviceId || !expira || !recebida || Number(expira) <= agora) return null;
  const esperada = Buffer.from(assinatura(segredo, `${aparelho}.${expira}`));
  const veio = Buffer.from(recebida);
  return esperada.length === veio.length && timingSafeEqual(esperada, veio) ? Number(expira) : null;
}
