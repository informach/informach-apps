import "server-only";
import { auth, authResult } from "@/lib/auth";
import { env } from "@/lib/env";
import { encerrarSessaoDeAparelho } from "./service";

const semCache = { "Cache-Control": "no-store" };

/**
 * Sair da conta, num pedido só: primeiro a sessão de aparelho é encerrada no
 * banco, depois a sessão de login. Nessa ordem, uma falha no meio deixa o
 * aparelho sem sessão de jogo possível (o portal manda entrar de novo), nunca
 * um login encerrado com a sessão de aparelho ainda valendo.
 */
export async function sairDaConta(request: Request): Promise<Response> {
  // Só o próprio portal pede a saída.
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return Response.json({ ok: false }, { status: 403, headers: semCache });
  const atual = await authResult.getSession(request.headers);
  if (atual)
    await encerrarSessaoDeAparelho({
      authSessionId: atual.session.id,
      contaId: atual.user.id,
    });
  const saida = await auth.api.signOut({ headers: request.headers, asResponse: true });
  if (!saida.ok) return Response.json({ ok: false }, { status: 503, headers: semCache });
  const resposta = Response.json({ ok: true }, { headers: semCache });
  // Os nomes e as opções dos cookies são do Better Auth: repassa como vieram.
  for (const cookie of saida.headers.getSetCookie()) resposta.headers.append("set-cookie", cookie);
  return resposta;
}
