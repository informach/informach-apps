import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { manifestoDoJogo, origensDoJogo } from "@/features/jogos/config";
import { jogoDoCaminho, montarCsp } from "@/lib/csp";

// A autenticação é feita nos layouts do servidor e em cada ação. O proxy só
// entrega os cabeçalhos de segurança do documento.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Só a página de um jogo deste deploy ganha as origens dele; qualquer outro
  // caminho, e `/jogar/<jogo que não existe>`, fica com a política do portal.
  const jogo = jogoDoCaminho(request.nextUrl.pathname);
  const csp = montarCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    jogo: jogo !== null && manifestoDoJogo(jogo) ? origensDoJogo(jogo) : null,
  });
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-nonce", nonce);
  // Sobrescreve o valor do cliente; os layouts usam isto só para voltar ao lugar certo depois do login.
  headers.set("x-recreio-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
