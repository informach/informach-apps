import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jsonUtf8 } from "@/features/ai/_shared";
import { ROUTINE_PATHS } from "@/features/notices/routine-paths";
import { taskStatusBodySchema } from "@/features/offline-queue/schemas";
import { writeTaskStatusOnce } from "@/features/offline-queue/service";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  AGENDA_RATE_LIMITS,
  enforceRateLimit,
  RateLimitedError,
  taskStatusKey,
} from "@/lib/rate-limit";
import {
  MalformedRequestBodyError,
  RequestBodyTooLargeError,
  readJsonWithSizeLimit,
} from "@/lib/request-size";

export const runtime = "nodejs";

const uuid = z.string().uuid();

/**
 * Concluir, reabrir ou cancelar uma atividade — com chave de idempotência.
 *
 * Existe porque a fila offline precisa de um endereço estável. Uma server
 * action tem identificador gerado no build: a gravação guardada no aparelho
 * numa sexta-feira não encontraria para onde ir depois do deploy de segunda.
 *
 * **O contrato com o cliente é o status HTTP.** `200` carrega um resultado de
 * negócio — inclusive a recusa por conflito de versão — e a fila pode apagar a
 * entrada. Qualquer outra coisa (401 de sessão expirada, 429, 5xx, falha de
 * rede) é transporte: a entrada FICA na fila e sobe quando der. Confundir os
 * dois é o que faz uma conclusão sumir em silêncio.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return jsonUtf8({ code: "FORBIDDEN" }, { status: 403 });
  const session = await getServerSession();
  if (!session?.user) return jsonUtf8({ code: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  if (!uuid.safeParse(id).success) return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
  const key = request.headers.get("idempotency-key");
  if (!key || !uuid.safeParse(key).success)
    return jsonUtf8({ code: "INVALID_KEY" }, { status: 400 });
  try {
    await enforceRateLimit({
      key: taskStatusKey(session.user.id),
      ...AGENDA_RATE_LIMITS.TASK_STATUS_PER_HOUR,
    });
    const parsed = taskStatusBodySchema.safeParse(await readJsonWithSizeLimit(request, 1024));
    if (!parsed.success) return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    const result = await writeTaskStatusOnce(session.user.id, {
      key,
      id,
      version: parsed.data.version,
      status: parsed.data.status,
      queued: request.headers.get("x-agenda-queued") === "1",
    });
    if (result.ok) for (const path of ROUTINE_PATHS) revalidatePath(path, "layout");
    // Resultado de negócio é sempre 200: a recusa já é a resposta final, e um
    // 4xx faria a fila tratá-la como falha de transporte e tentar para sempre.
    return jsonUtf8(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RateLimitedError)
      return jsonUtf8(
        { code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    if (error instanceof RequestBodyTooLargeError)
      return jsonUtf8({ code: "INVALID_INPUT" }, { status: 413 });
    if (error instanceof MalformedRequestBodyError || error instanceof SyntaxError)
      return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    // Falha nossa: 500 para a fila insistir. Engolir com 200 apagaria a
    // conclusão do aparelho sem ela ter chegado a lugar nenhum.
    logger.error({ err: error }, "agenda.task_status.failed");
    return jsonUtf8({ code: "WRITE_FAILED" }, { status: 500 });
  }
}
