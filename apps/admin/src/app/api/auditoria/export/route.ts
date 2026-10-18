import { AuditPersistenceError, ForbiddenError, UnauthorizedError } from "@informach/auth";
import { exportAuditCsv } from "@/features/audit/export";
import { exportReturnPath } from "@/features/audit/filters";
import { isSameOriginRequest } from "@/lib/fetch-site";

/** Volta para a Auditoria com a explicação, sem gerar arquivo. */
function backToAudit(params: Record<string, string>, reason: "confirmar" | "falhou") {
  return new Response(null, {
    status: 303,
    headers: { Location: exportReturnPath(params, reason), "Cache-Control": "no-store" },
  });
}

/**
 * CSV da auditoria com os filtros da tela. Só owner; admin recebe 403.
 *
 * A exportação grava `admin.audit_exported`, então só atende o clique no botão
 * da própria Auditoria (`Sec-Fetch-Site: same-origin`): um link de outro site,
 * mesmo de outro subdomínio da casa, ou o endereço digitado voltam para a tela.
 * Se o registro na auditoria não gravar, o arquivo não sai.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  if (!isSameOriginRequest(request.headers.get("sec-fetch-site")))
    return backToAudit(params, "confirmar");
  try {
    const { csv, filename } = await exportAuditCsv(params);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return new Response(null, { status: 401 });
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    if (error instanceof AuditPersistenceError) return backToAudit(params, "falhou");
    throw error;
  }
}
