import { timingSafeEqual } from "node:crypto";
import { tokenFromRecipient } from "@/features/inbox/address";
import {
  ALLOWED_ATTACHMENT_TYPES,
  type InboundEmail,
  receiveInboundEmail,
} from "@/features/inbox/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";
import {
  MalformedRequestBodyError,
  RequestBodyTooLargeError,
  readFormDataWithSizeLimit,
} from "@/lib/request-size";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 5 MB é o mesmo teto do anexo de um recado. */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function authorized(request: Request): boolean {
  const expected = env.INBOUND_EMAIL_BASIC_AUTH;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const provided = Buffer.from(header.slice(6), "base64").toString("utf8");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * O corpo em texto quando o e-mail só veio em HTML.
 *
 * Tira script e estilo (não só estilo: o conteúdo de `<script>` viraria texto
 * do recado e seria lido pela IA) e devolve as entidades ao que elas
 * representam, senão a família revisa "informa&ccedil;&otilde;es".
 *
 * Limitação conhecida: o Inbound Parse entrega os campos no charset do
 * original, e `formData()` decodifica como UTF-8. Um remetente em ISO-8859-1
 * chega com acento trocado, e a recuperação não é possível depois da
 * decodificação. Está registrado no guia do app, §8.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Recado que chega por e-mail.
 *
 * Quem entrega é o Inbound Parse do SendGrid, autenticado por Basic Auth na
 * própria URL (não há assinatura no Inbound Parse — a URL secreta e o Basic
 * Auth são o que existe). O corpo vem como `multipart/form-data`.
 *
 * **Nada é lido por IA aqui, e nada é cobrado.** A mensagem fica guardada até a
 * família escolher a criança e mandar organizar; sem isso, quem descobrisse o
 * endereço esvaziaria os créditos da casa mandando e-mail.
 *
 * Responde 200 quando RECUSA por regra de negócio — endereço desconhecido,
 * caixa cheia, limite de frequência —, porque reentregar o que já foi recusado
 * só repete. Responde 500 quando a falha é nossa (banco, Redis): aí a
 * reentrega do SendGrid é a única chance de o recado não se perder.
 */
export async function POST(request: Request) {
  if (!env.INBOUND_EMAIL_DOMAIN || !env.INBOUND_EMAIL_BASIC_AUTH)
    return new Response(null, { status: 503 });
  if (!authorized(request)) return new Response(null, { status: 401 });

  try {
    const form = await readFormDataWithSizeLimit(request, MAX_BODY_BYTES);
    // O envelope traz o destinatário REAL; o cabeçalho `to` pode ser a lista
    // da escola, com a família em cópia oculta.
    const envelope = String(form.get("envelope") ?? "");
    let to = String(form.get("to") ?? "");
    try {
      const parsed = JSON.parse(envelope) as { to?: unknown };
      if (Array.isArray(parsed.to) && typeof parsed.to[0] === "string") to = parsed.to[0];
    } catch {
      // Sem envelope legível, fica o cabeçalho.
    }
    // A chave é o TOKEN normalizado, não o destinatário cru: quem manda escolhe
    // a caixa e o alias do endereço, e variar a grafia driblaria o balde.
    const token = tokenFromRecipient(to, env.INBOUND_EMAIL_DOMAIN);
    if (token) {
      try {
        await enforceRateLimit({ key: `inbox:${token}`, limit: 30, windowSeconds: 3600 });
      } catch (error) {
        if (!(error instanceof RateLimitedError)) throw error;
        logger.info({ code: "RATE_LIMITED" }, "agenda.inbox.rejected");
        return new Response(null, { status: 200 });
      }
    }

    const attachments = Number(form.get("attachments") ?? 0);
    let attachment: InboundEmail["attachment"] = null;
    for (let index = 1; index <= Math.min(attachments, 10); index += 1) {
      const file = form.get(`attachment${index}`);
      // O tipo entra no filtro do laço, e não só depois dele: a assinatura da
      // escola costuma vir como primeiro anexo, e parar nela descartava em
      // silêncio o PDF do comunicado que vinha logo atrás.
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > MAX_ATTACHMENT_BYTES ||
        !ALLOWED_ATTACHMENT_TYPES.includes(file.type)
      )
        continue;
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      attachment = {
        name: file.name,
        type: file.type,
        dataUrl: `data:${file.type};base64,${base64}`,
      };
      break;
    }

    const text = String(form.get("text") ?? "") || htmlToText(String(form.get("html") ?? ""));
    const result = await receiveInboundEmail({
      to,
      from: String(form.get("from") ?? ""),
      subject: String(form.get("subject") ?? ""),
      text,
      attachment,
    });
    if (!result.ok) logger.info({ code: result.error.code }, "agenda.inbox.rejected");
    return new Response(null, { status: 200 });
  } catch (error) {
    // Corpo grande ou ilegível não melhora na reentrega.
    if (error instanceof RequestBodyTooLargeError || error instanceof MalformedRequestBodyError)
      return new Response(null, { status: 200 });
    logger.error({ err: error }, "agenda.inbox.failed");
    return new Response(null, { status: 500 });
  }
}
