import { comCifradorPessoal } from "@/features/direitos/exportacao-runtime";
import { abrirArquivoPessoal } from "@/features/direitos/exportacao-service";
import { autorDaFamilia } from "@/features/familia/autor";
import { runAction } from "@/lib/action";
import { boundedBytes, mesmaOrigem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** O UUID não vai em URL pública ou log de acesso. POST da própria origem,
 * sessão nativa e nova admissão após abrir o envelope são obrigatórios. */
export async function POST(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  if (!mesmaOrigem(request))
    return Response.json({ ok: false, code: "ORIGEM" }, { status: 403, headers });
  const resultado = await runAction(async () => {
    const autor = await autorDaFamilia();
    const corpo = await boundedBytes(request, 256);
    let entrada: unknown;
    try {
      entrada = corpo === null ? null : JSON.parse(Buffer.from(corpo).toString("utf8"));
    } catch {
      entrada = null;
    }
    return comCifradorPessoal((cifrador) => abrirArquivoPessoal(autor, entrada, cifrador));
  });
  if (!resultado.ok)
    return Response.json(resultado, {
      status:
        resultado.code === "AUTH" || resultado.code === "LOGIN_RECENTE"
          ? 401
          : resultado.code === "UNEXPECTED"
            ? 503
            : 400,
      headers,
    });
  try {
    return new Response(new Uint8Array(resultado.data), {
      headers: {
        ...headers,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": 'attachment; filename="recreio-dados.jsonl"',
      },
    });
  } finally {
    resultado.data.fill(0);
  }
}
