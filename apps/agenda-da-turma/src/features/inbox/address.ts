/**
 * O endereço de e-mail da família, e o que ele é.
 *
 * `recados+<token>@<domínio>`: quem o tem consegue **depositar** um recado na
 * caixa da família — nunca ler o que já está lá. É por isso que ele pode
 * circular no grupo da escola sem virar chave de acesso à rotina de ninguém, e
 * por isso ele é girável: se virar alvo de propaganda, troca-se o token.
 *
 * Puro, sem banco: a aritmética do endereço é testada sem servidor.
 */
export const INBOX_TOKEN_LENGTH = 20;
/** Sem 0/O/1/I/L: o endereço é lido em voz alta e digitado à mão. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInboxToken(random: () => number = Math.random): string {
  let token = "";
  for (let i = 0; i < INBOX_TOKEN_LENGTH; i += 1)
    token += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? "A";
  return token;
}

export function inboxAddress(token: string, domain: string): string {
  return `recados+${token.toLowerCase()}@${domain}`;
}

/**
 * Extrai o token de um destinatário.
 *
 * O Inbound Parse entrega o envelope com o destinatário real, que pode vir com
 * nome (`"Escola" <recados+ABC@dominio>`) e em qualquer caixa.
 */
export function tokenFromRecipient(recipient: string, domain: string): string | null {
  const match = /<([^>]+)>/.exec(recipient);
  const address = (match?.[1] ?? recipient).trim().toLowerCase();
  const expected = `@${domain.toLowerCase()}`;
  if (!address.endsWith(expected)) return null;
  const local = address.slice(0, -expected.length);
  const plus = local.indexOf("+");
  if (plus < 0 || local.slice(0, plus) !== "recados") return null;
  const token = local.slice(plus + 1);
  return /^[a-z0-9]{8,64}$/.test(token) ? token.toUpperCase() : null;
}

/** O domínio do remetente, para a família reconhecer a escola. Nunca o endereço. */
export function senderDomain(from: string): string | null {
  const match = /<([^>]+)>/.exec(from);
  const address = (match?.[1] ?? from).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address.slice(at + 1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}
