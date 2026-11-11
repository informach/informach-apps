import { z } from "zod";
import { requestFamily } from "@/features/familia/quem";
import { goalPhoto } from "@/features/loja/repository";

export const dynamic = "force-dynamic";

/** A foto da meta de uma criança, só para a família dela. */
export async function GET(_request: Request, { params }: { params: Promise<{ childId: string }> }) {
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).childId);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const quem = await requestFamily();
  if (!quem) return new Response("Unauthorized", { status: 401 });
  const foto = await goalPhoto(quem, parsed.data);
  if (!foto) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(foto.data), {
    headers: {
      "Content-Type": foto.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
