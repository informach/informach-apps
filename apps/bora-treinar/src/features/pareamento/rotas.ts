import "server-only";
import { clientIpFromHeaders } from "@informach/auth/client-ip";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { boundedBody } from "@/lib/http";
import { audit, reportError } from "@/lib/observability";
import { preparePairingAuthority } from "./authorization";
import { pairingContextSchema } from "./context";
import { codigoSchema, estadoTvSchema, eventoCelularSchema } from "./protocolo";
import {
  barramento,
  canal,
  canalAutorizado,
  criarPareamento,
  DURACAO_CANAL_S,
  emitirCredencial,
  entrarComCodigo,
  lerCredencial,
  streamSse,
  tvDona,
  ultimoEstado,
} from "./servidor";

export const CREDENCIAL_COOKIE = "bt-par";
const json = (corpo: unknown, status = 200) =>
  Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
const indisponivel = () =>
  json({ erro: "O pareamento está indisponível agora. Tente de novo em instantes." }, 503);
const encerrado = () => json({ erro: "Pareamento encerrado. Gere outro na TV." }, 401);
const sameOrigin = (request: Request) =>
  request.headers.get("origin") === new URL(env.NEXT_PUBLIC_APP_URL).origin;

async function runRoute(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    reportError(error, crypto.randomUUID());
    return indisponivel();
  }
}
async function lerJson(request: Request): Promise<unknown> {
  const bruto = await boundedBody(request, 4096);
  if (bruto === null) return undefined;
  try {
    return JSON.parse(bruto);
  } catch {
    return undefined;
  }
}

/** TV proves its captured adult, family, training profiles and current central browser. */
export async function criar(request: Request) {
  if (!sameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  return runRoute(async () => {
    const session = await getSession();
    if (!session?.user.emailVerified) return json({ erro: "Entre na conta para parear." }, 401);
    const parsed = pairingContextSchema.safeParse(await lerJson(request));
    if (!parsed.success || parsed.data.actorId !== session.user.id) return encerrado();
    const authority = await preparePairingAuthority(parsed.data, session.session.id);
    if (!authority)
      return json({ erro: "Confira o acesso aos perfis e a assinatura desta família." }, 403);
    const bus = barramento();
    if (!bus) return indisponivel();
    const channel = await criarPareamento(bus, authority);
    if (!channel) return json({ erro: "Muitos pareamentos seguidos. Aguarde um pouco." }, 429);
    audit({ eventType: "bora.pairing_started", actorId: session.user.id, payload: {} });
    return json({
      codigo: channel.codigo,
      canalId: channel.id,
      url: `${env.NEXT_PUBLIC_APP_URL}/camera/${channel.codigo}`,
    });
  });
}

/** Phone entry uses the short code once. Reconnection must present the same signed generation. */
export async function entrar(request: Request) {
  if (!sameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  return runRoute(async () => {
    const bus = barramento();
    if (!bus) return indisponivel();
    const ip = clientIpFromHeaders(request.headers) ?? "desconhecido";
    if ((await bus.incr(`bora-treinar:par:ip:${ip}`, 600)) > 30)
      return json({ erro: "Muitas tentativas. Aguarde alguns minutos." }, 429);
    const corpo = z.object({ codigo: codigoSchema }).safeParse(await lerJson(request));
    if (!corpo.success) return json({ erro: "Código inválido." }, 400);
    const previous = lerCredencial((await cookies()).get(CREDENCIAL_COOKIE)?.value);
    const current =
      previous?.codigo === corpo.data.codigo
        ? await canalAutorizado(bus, previous.codigo, previous.registroId)
        : null;
    if (current?.celular) {
      await bus.publicar(
        canal(corpo.data.codigo, current.id, "tv"),
        JSON.stringify({ tipo: "ola" }),
      );
      return json({ ok: true });
    }
    const joined = await entrarComCodigo(bus, corpo.data.codigo);
    if (!joined)
      return json({ erro: "Código vencido, sem acesso ou já usado. Gere outro na TV." }, 404);
    const expiresAt = joined.criadoEm + DURACAO_CANAL_S * 1000;
    (await cookies()).set(
      CREDENCIAL_COOKIE,
      emitirCredencial(corpo.data.codigo, joined.id, expiresAt),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
        path: "/api/pareamento",
        expires: new Date(expiresAt),
      },
    );
    await bus.publicar(canal(corpo.data.codigo, joined.id, "tv"), JSON.stringify({ tipo: "ola" }));
    audit({ eventType: "bora.pairing_connected", actorId: joined.actorId, payload: {} });
    return json({ ok: true });
  });
}

export async function eventos(request: Request) {
  if (!sameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  return runRoute(async () => {
    const bus = barramento();
    if (!bus) return indisponivel();
    const credential = lerCredencial((await cookies()).get(CREDENCIAL_COOKIE)?.value);
    if (!credential) return encerrado();
    if (
      (await bus.incr(`bora-treinar:par:${credential.codigo}:${credential.registroId}:taxa`, 60)) >
      1500
    )
      return json({ erro: "Eventos demais." }, 429);
    const evento = eventoCelularSchema.safeParse(await lerJson(request));
    if (!evento.success) return json({ erro: "Evento inválido." }, 400);
    const current = await canalAutorizado(bus, credential.codigo, credential.registroId);
    if (!current?.celular) return encerrado();
    await bus.publicar(canal(credential.codigo, current.id, "tv"), JSON.stringify(evento.data));
    return json({ ok: true });
  });
}

export async function estado(request: Request) {
  if (!sameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  return runRoute(async () => {
    const session = await getSession();
    if (!session) return encerrado();
    const bus = barramento();
    if (!bus) return indisponivel();
    const corpo = z
      .object({ codigo: codigoSchema, canalId: z.uuid(), estado: estadoTvSchema })
      .safeParse(await lerJson(request));
    if (!corpo.success) return json({ erro: "Estado inválido." }, 400);
    const current = await tvDona(
      bus,
      corpo.data.codigo,
      corpo.data.canalId,
      session.user.id,
      session.session.id,
    );
    if (!current) return encerrado();
    const texto = JSON.stringify(corpo.data.estado);
    const remaining = Math.ceil((current.criadoEm + DURACAO_CANAL_S * 1000 - Date.now()) / 1000);
    if (remaining <= 0) return encerrado();
    await bus.set(ultimoEstado(corpo.data.codigo, current.id), texto, remaining);
    await bus.publicar(canal(corpo.data.codigo, current.id, "celular"), texto);
    return json({ ok: true });
  });
}

export async function stream(request: Request) {
  return runRoute(async () => {
    const bus = barramento();
    if (!bus) return indisponivel();
    const params = new URL(request.url).searchParams;
    if (params.get("lado") === "tv") {
      const session = await getSession();
      const codigo = codigoSchema.safeParse(params.get("codigo"));
      const id = z.uuid().safeParse(params.get("canalId"));
      if (!session || !codigo.success || !id.success) return encerrado();
      const authorize = async () =>
        Boolean(await tvDona(bus, codigo.data, id.data, session.user.id, session.session.id));
      if (!(await authorize())) return encerrado();
      return streamSse(bus, canal(codigo.data, id.data, "tv"), null, request.signal, authorize);
    }
    const credential = lerCredencial((await cookies()).get(CREDENCIAL_COOKIE)?.value);
    if (!credential) return encerrado();
    const authorize = async () =>
      Boolean((await canalAutorizado(bus, credential.codigo, credential.registroId))?.celular);
    if (!(await authorize())) return encerrado();
    return streamSse(
      bus,
      canal(credential.codigo, credential.registroId, "celular"),
      () => bus.get(ultimoEstado(credential.codigo, credential.registroId)),
      request.signal,
      authorize,
    );
  });
}
