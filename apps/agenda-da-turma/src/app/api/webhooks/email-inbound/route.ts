import { timingSafeEqual } from "node:crypto";
import { type InboundEmail, receiveInboundEmail } from "@/features/inbox/service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitedError } from "@/lib/rate-limit";

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
 * Depois de autenticado, responde 200 mesmo quando recusa: o SendGrid reentrega
 * em erro, e reentregar uma mensagem que já foi recusada por limite ou endereço
 * inválido só gera repetição.
 */
export async function POST(request: Request) {
  if (!env.INBOUND_EMAIL_DOMAIN || !env.INBOUND_EMAIL_BASIC_AUTH)
    return new Response(null, { status: 503 });
  if (!authorized(request)) return new Response(null, { status: 401 });

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) return new Response(null, { status: 200 });
    const form = await request.formData();
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
    await enforceRateLimit({ key: `inbox:${to}`, limit: 30, windowSeconds: 3600 });

    const attachments = Number(form.get("attachments") ?? 0);
    let attachment: InboundEmail["attachment"] = null;
    for (let index = 1; index <= Math.min(attachments, 5); index += 1) {
      const file = form.get(`attachment${index}`);
      if (!(file instanceof File) || file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) continue;
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      attachment = {
        name: file.name,
        type: file.type,
        dataUrl: `data:${file.type};base64,${base64}`,
      };
      break;
    }

    const html = String(form.get("html") ?? "");
    const text =
      String(form.get("text") ?? "") ||
      // Sem corpo em texto, o que sobra é o HTML sem as tags: pior, mas melhor
      // do que uma mensagem vazia que a família não entende por que chegou.
      html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

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
    if (error instanceof RateLimitedError) return new Response(null, { status: 429 });
    logger.warn("agenda.inbox.failed");
    return new Response(null, { status: 200 });
  }
}
