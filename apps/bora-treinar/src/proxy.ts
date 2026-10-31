import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// A autenticação é feita no layout do servidor e em cada mutação. O proxy só
// entrega os cabeçalhos de segurança do documento.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval': o detector de pose do MediaPipe é WebAssembly servido
    // pela própria origem (public/mediapipe). Nenhum eval de texto é liberado.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-nonce", nonce);
  // Sobrescreve o valor do cliente; os layouts usam isto só para voltar ao lugar certo depois do login.
  headers.set("x-bora-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mediapipe/).*)"],
};
