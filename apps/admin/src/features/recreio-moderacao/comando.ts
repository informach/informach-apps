import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { getAppUrl } from "@informach/config";
import { type ComandoDeModeracao, ReciboDeModeracaoSchema } from "@informach/recreio/contrato";
import { emitirProvaDeModeracao } from "@informach/recreio/emissor";
import type { Staff } from "@/lib/access";
import type { ActionResult } from "@/lib/action";
import { getEnv } from "@/lib/env";
import { reportOperationalError } from "@/lib/observability";
import { serviceOrigins } from "@/lib/products";

const INCERTO =
  "Não recebemos a confirmação do Recreio. Atualize o caso para conferir a situação antes de agir novamente.";
async function lerRecibo(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    while (true) {
      const parte = await reader.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 4096) {
        await reader.cancel();
        return null;
      }
      partes.push(parte.value);
    }
    const resultado = ReciboDeModeracaoSchema.safeParse(
      JSON.parse(Buffer.concat(partes).toString("utf8")),
    );
    return resultado.success ? resultado.data : null;
  } finally {
    reader.releaseLock();
  }
}

/** Apenas servidor: prova curta e sessão real nunca chegam ao navegador. Sem retry de rede. */
export async function enviarComandoDeModeracao(
  staff: Staff,
  sessionId: string,
  comando: ComandoDeModeracao,
): Promise<ActionResult> {
  const env = getEnv();
  if (!env.RECREIO_MODERATION_SECRET)
    return { ok: false, error: "A emissão restrita de moderação ainda não foi configurada." };
  // Em produção o destino é o catálogo canônico, não um override usado nas sondagens.
  const origem = new URL(
    env.NODE_ENV === "production"
      ? getAppUrl("recreio", "production")
      : serviceOrigins(env.ADMIN_SERVICE_URLS).recreio,
  );
  if (
    origem.protocol !== "https:" &&
    !(
      env.NODE_ENV !== "production" &&
      origem.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(origem.hostname)
    )
  )
    return { ok: false, error: "O destino restrito da moderação está indisponível." };
  const prova = await emitirProvaDeModeracao(env.RECREIO_MODERATION_SECRET, {
    contaId: staff.id,
    authSessionId: sessionId,
    comando,
    agora: new Date(),
  });
  await logAuditEventStrict("admin.recreio_moderation_requested", staff.id, {
    app: "recreio",
    commandId: comando.comandoId,
    caseId: comando.protocolo,
    operation: comando.operacao,
  });
  try {
    const response = await fetch(new URL("/api/moderacao/v1/comandos", origem), {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${prova}`, "Content-Type": "application/json" },
      body: JSON.stringify(comando),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 409)
        return {
          ok: false,
          error: "O caso mudou. Atualize a fila e confira as revisões antes de continuar.",
        };
      if ([401, 403].includes(response.status))
        return {
          ok: false,
          error:
            "O Recreio recusou a autorização atual. Entre novamente no Bastidores e confira a configuração restrita.",
        };
      if (response.status === 429)
        return {
          ok: false,
          error: "Muitos comandos seguidos. Aguarde um minuto e confira o caso.",
        };
      return { ok: false, error: INCERTO };
    }
    const recibo = await lerRecibo(response);
    if (
      !recibo ||
      recibo.comandoId !== comando.comandoId ||
      recibo.protocolo !== comando.protocolo ||
      recibo.operacao !== comando.operacao
    )
      return { ok: false, error: INCERTO };
    return {
      ok: true,
      message: `Comando confirmado pelo Recreio e registrado na auditoria${recibo.repetido ? "; o recibo anterior foi recuperado" : ""}.`,
    };
  } catch (erro) {
    reportOperationalError("recreio.moderation_confirmation_unknown", erro, {
      actorId: staff.id,
      commandId: comando.comandoId,
    });
    return { ok: false, error: INCERTO };
  }
}
