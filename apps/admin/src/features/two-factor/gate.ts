import { allowedAuthPath } from "@/lib/auth-routes";
import { asksToTrustDevice } from "./service";

/**
 * O que a rota `/api/auth/[...all]` confere antes de entregar o pedido ao
 * Better Auth. Fica separado da rota para o teste trocar as dependências.
 */
export type AuthGateDeps = {
  handler: (request: Request) => Promise<Response>;
  /** Sessão do pedido, lida no próprio Better Auth. */
  currentSession: (request: Request) => Promise<{ sessionId: string; userId: string } | null>;
  /** Consome a prova por e-mail da sessão; `null` quando não há prova válida. */
  takeProof: (sessionId: string) => Promise<{ expiresAt: Date } | null>;
  /** Devolve a prova quando a ativação falhou (senha errada, por exemplo). */
  restoreProof: (sessionId: string, userId: string, expiresAt: Date) => Promise<void>;
  report: (error: unknown) => void;
};

const SECOND_FACTOR_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

function refuse(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Lê um campo do corpo sem consumir o pedido, nos formatos que o Better Auth aceita. */
async function bodyField(request: Request, field: string): Promise<unknown> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (/^application\/([a-z0-9.+-]*\+)?json/.test(type)) {
      const body: unknown = await request.clone().json();
      return body && typeof body === "object"
        ? (body as Record<string, unknown>)[field]
        : undefined;
    }
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data"))
      return (await request.clone().formData()).get(field) ?? undefined;
  } catch {
    // Corpo ilegível: o Better Auth recusa sozinho.
  }
  return undefined;
}

/**
 * - Rota fora da lista fechada: 404.
 * - Segunda etapa com `trustDevice`: 400. O cookie de "confiar neste aparelho"
 *   faria a senha bastar por 30 dias, e o Bastidores pede o código em toda entrada.
 * - Ativação sem a prova por e-mail desta sessão: 403. A prova é consumida antes
 *   de repassar (uso único, inclusive com dois pedidos ao mesmo tempo) e
 *   devolvida se a ativação não der certo.
 */
export async function guardAuthRequest(request: Request, deps: AuthGateDeps): Promise<Response> {
  const path = allowedAuthPath(request.method, new URL(request.url).pathname);
  if (!path) return Response.json({ error: "not_found" }, { status: 404 });

  if (SECOND_FACTOR_PATHS.has(path) && asksToTrustDevice(await bodyField(request, "trustDevice")))
    return refuse(
      400,
      "TRUST_DEVICE_NOT_ALLOWED",
      "O Bastidores pede o código em toda entrada; este aparelho não pode ser lembrado.",
    );

  if (path !== "/two-factor/enable") return deps.handler(request);

  const session = await deps.currentSession(request);
  if (!session) return refuse(401, "UNAUTHORIZED", "Entre de novo para continuar.");
  const proof = await deps.takeProof(session.sessionId);
  if (!proof)
    return refuse(
      403,
      "EMAIL_CODE_REQUIRED",
      "Confirme o código enviado ao seu e-mail antes de ativar as duas etapas.",
    );

  const giveBack = () =>
    deps.restoreProof(session.sessionId, session.userId, proof.expiresAt).catch(deps.report);
  let response: Response;
  try {
    response = await deps.handler(request);
  } catch (error) {
    await giveBack();
    throw error;
  }
  if (!response.ok) await giveBack();
  return response;
}
