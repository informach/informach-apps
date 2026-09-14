import { UnauthorizedError } from "@informach/auth";
import { exportFamily } from "@/features/learning/repository";
import { recentParent } from "@/lib/action";
import { AppError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await recentParent();
    return Response.json(await exportFamily(user.id), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "attachment; filename=missao-saber-dados.json",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return Response.json(
        { error: "Entre novamente para continuar." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof AppError)
      return Response.json(
        { error: error.message },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
}
