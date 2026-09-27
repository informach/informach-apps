import { unsubscribe } from "@/lib/emails";

/**
 * Descadastro de e-mail.
 *
 * O GET só mostra a confirmação: scanners de link abrem todo endereço de um
 * e-mail, e um GET que já cancelasse a preferência descadastraria a família
 * sem ela saber. O POST aplica, tanto pelo botão desta página quanto pelo
 * cabeçalho List-Unsubscribe de um clique, que também usa POST.
 */
function pagina(titulo: string, corpo: string, status: number) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo} · Missão Saber</title></head><body style="font-family:system-ui,sans-serif;padding:32px 16px;max-width:520px;margin:0 auto;color:#1f2933;line-height:1.5"><p style="font-size:14px;color:#6b7280;margin:0 0 16px">Missão Saber</p><h1 style="font-size:24px;margin:0 0 12px">${titulo}</h1>${corpo}</body></html>`,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        // Página fora do proxy: a política vem aqui mesmo, só com o necessário.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
function tokenValido(token: string | null): token is string {
  return !!token && token.length <= 2000;
}
function escapar(texto: string) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!tokenValido(token))
    return pagina("Link inválido", "<p>Este link de descadastro não é válido.</p>", 400);
  return pagina(
    "Deixar de receber este e-mail?",
    `<p>Confirme para não receber mais este tipo de e-mail do Missão Saber, como o resumo semanal. Dá para reativar na área da família. E-mails essenciais de acesso e cobrança continuam sendo enviados.</p><form method="post"><input type="hidden" name="t" value="${escapar(token)}"><button type="submit" style="font:inherit;font-weight:600;padding:12px 20px;border-radius:12px;border:2px solid #1f2933;background:#fff;cursor:pointer">Confirmar descadastro</button></form>`,
    200,
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t");
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = form?.get("t")?.toString() ?? null;
  }
  if (!tokenValido(token))
    return pagina("Link inválido", "<p>Este link de descadastro não é válido.</p>", 400);
  const result = await unsubscribe(token);
  return result.ok
    ? pagina(
        "Preferência registrada",
        "<p>Você não receberá mais mensagens desta categoria. E-mails essenciais de autenticação e cobrança podem continuar sendo enviados.</p>",
        200,
      )
    : pagina("Link inválido", "<p>Este link de descadastro não é válido ou já expirou.</p>", 400);
}
