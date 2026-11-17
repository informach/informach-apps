import { CheckpointDoHostSchema } from "@informach/recreio/contrato";
import { confirmarCheckpointDoMundo } from "@/features/posse/checkpoint";
import { hostDoPedido } from "@/features/posse/http";
import { corpoJson, json, responder } from "@/lib/http";

export const dynamic = "force-dynamic";
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () =>
    json(
      await confirmarCheckpointDoMundo(
        await hostDoPedido(request),
        (await params).id,
        await corpoJson(request, CheckpointDoHostSchema, 2048),
      ),
    ),
  );
}
