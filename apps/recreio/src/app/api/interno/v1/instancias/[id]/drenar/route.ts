import { hostDoCaminho } from "@/features/posse/http";
import { drenar } from "@/features/posse/service";
import { json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A instância avisa que vai sair e deixa de receber mundos novos. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    await drenar(await hostDoCaminho(request, (await params).id));
    return json({});
  });
}
