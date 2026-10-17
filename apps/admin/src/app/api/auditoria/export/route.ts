import { ForbiddenError, UnauthorizedError } from "@informach/auth";
import { exportAuditCsv } from "@/features/audit/export";

/** CSV da auditoria com os filtros da tela. Só owner; admin recebe 403. */
export async function GET(request: Request) {
  try {
    const { csv, filename } = await exportAuditCsv(
      Object.fromEntries(new URL(request.url).searchParams),
    );
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
    throw error;
  }
}
