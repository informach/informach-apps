import "server-only";
import { clientIpFromHeaders } from "@informach/auth/client-ip";
import { cookies } from "next/headers";
import { z } from "zod";
import { canPairPhone } from "@/features/acesso/policy";
import { familyView } from "@/features/familia/view";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { boundedBody } from "@/lib/http";
import { audit, reportError } from "@/lib/observability";
import { codigoSchema, estadoTvSchema, eventoCelularSchema } from "./protocolo";
import {
  barramento,
  canal,
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

async function lerJson(request: Request, limite = 4096): Promise<unknown> {
  const bruto = await boundedBody(request, limite);
  if (bruto === null) return undefined;
  try {
    return JSON.parse(bruto);
  } catch {
    return undefined;
  }
}

/** TV (sessão do titular, plano pago): cria o código e o endereço do QR. */
export async function criar() {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return json({ erro: "Entre na conta para parear." }, 401);
  const { access } = await familyView(user.id);
  if (!canPairPhone(access))
    return json({ erro: "O celular como câmera faz parte da assinatura." }, 403);
  const bus = barramento();
  if (!bus) return indisponivel();
  try {
    const codigo = await criarPareamento(bus, user.id);
    if (!codigo) return json({ erro: "Muitos pareamentos seguidos. Aguarde um pouco." }, 429);
    audit({ eventType: "bora.pairing_started", actorId: user.id, payload: {} });
    return json({ codigo, url: `${env.NEXT_PUBLIC_APP_URL}/camera/${codigo}` });
  } catch (error) {
    reportError(error, crypto.randomUUID());
    return indisponivel();
  }
}

/** Celular (sem login): troca o código por uma credencial presa àquele canal. */
export async function entrar(request: Request) {
  const bus = barramento();
  if (!bus) return indisponivel();
  const ip = clientIpFromHeaders(request.headers) ?? "desconhecido";
  if ((await bus.incr(`bora-treinar:par:ip:${ip}`, 600)) > 30)
    return json({ erro: "Muitas tentativas. Aguarde alguns minutos." }, 429);
  const corpo = z.object({ codigo: codigoSchema }).safeParse(await lerJson(request));
  if (!corpo.success) return json({ erro: "Código inválido." }, 400);
  const dono = await entrarComCodigo(bus, corpo.data.codigo);
  if (!dono) return json({ erro: "Código vencido ou já usado. Gere outro na TV." }, 404);
  (await cookies()).set(CREDENCIAL_COOKIE, emitirCredencial(corpo.data.codigo), {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/api/pareamento",
    maxAge: DURACAO_CANAL_S,
  });
  await bus.publicar(canal(corpo.data.codigo, "tv"), JSON.stringify({ tipo: "ola" }));
  audit({ eventType: "bora.pairing_connected", actorId: dono, payload: {} });
  return json({ ok: true });
}

/** Celular → TV: eventos de contagem. */
export async function eventos(request: Request) {
  const bus = barramento();
  if (!bus) return indisponivel();
  const codigo = lerCredencial((await cookies()).get(CREDENCIAL_COOKIE)?.value);
  if (!codigo) return json({ erro: "Pareamento encerrado." }, 401);
  if ((await bus.incr(`bora-treinar:par:${codigo}:taxa`, 60)) > 1500)
    return json({ erro: "Eventos demais." }, 429);
  const evento = eventoCelularSchema.safeParse(await lerJson(request));
  if (!evento.success) return json({ erro: "Evento inválido." }, 400);
  await bus.publicar(canal(codigo, "tv"), JSON.stringify(evento.data));
  return json({ ok: true });
}

/** TV → celular: o passo atual do treino. */
export async function estado(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ erro: "Entre na conta." }, 401);
  const bus = barramento();
  if (!bus) return indisponivel();
  const corpo = z
    .object({ codigo: codigoSchema, estado: estadoTvSchema })
    .safeParse(await lerJson(request));
  if (!corpo.success) return json({ erro: "Estado inválido." }, 400);
  if (!(await tvDona(bus, corpo.data.codigo, user.id)))
    return json({ erro: "Pareamento não encontrado." }, 404);
  const texto = JSON.stringify(corpo.data.estado);
  await bus.set(ultimoEstado(corpo.data.codigo), texto, DURACAO_CANAL_S);
  await bus.publicar(canal(corpo.data.codigo, "celular"), texto);
  return json({ ok: true });
}

/** Fluxo SSE de cada lado: a TV pelo login, o celular pela credencial. */
export async function stream(request: Request) {
  const bus = barramento();
  if (!bus) return indisponivel();
  const params = new URL(request.url).searchParams;
  if (params.get("lado") === "tv") {
    const user = await getCurrentUser();
    const codigo = codigoSchema.safeParse(params.get("codigo"));
    if (!user || !codigo.success || !(await tvDona(bus, codigo.data, user.id)))
      return json({ erro: "Pareamento não encontrado." }, 404);
    return streamSse(bus, canal(codigo.data, "tv"), null, request.signal);
  }
  const codigo = lerCredencial((await cookies()).get(CREDENCIAL_COOKIE)?.value);
  if (!codigo) return json({ erro: "Pareamento encerrado." }, 401);
  return streamSse(
    bus,
    canal(codigo, "celular"),
    await bus.get(ultimoEstado(codigo)),
    request.signal,
  );
}
