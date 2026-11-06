import { z } from "zod";
import { requestFamily } from "@/features/familia/quem";
import { readVoice } from "@/features/rotina/repository";

export const dynamic = "force-dynamic";

/** A voz gravada de uma tarefa, para o tablet tocar e os pais ouvirem. */
export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).taskId);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const quem = await requestFamily();
  if (!quem) return new Response("Unauthorized", { status: 401 });
  const voz = await readVoice(quem.ownerId, parsed.data, quem.childIds);
  if (!voz) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(voz.data), {
    headers: {
      "Content-Type": voz.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
