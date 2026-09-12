import { z } from "zod";
import { getNoticeSource } from "@/features/notices/repository";
import { getServerSession } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const source = await getNoticeSource(session.user.id, id);
  if (
    !source?.attachmentData ||
    !source.attachmentExpiresAt ||
    source.attachmentExpiresAt <= new Date()
  )
    return new Response(null, { status: 404 });
  return new Response(Buffer.from(source.attachmentData, "base64"), {
    headers: {
      "Content-Type": source.attachmentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(source.attachmentName ?? "anexo")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
