import { type NextRequest, NextResponse } from "next/server";
import { getAuth } from "./lib/auth";

/**
 * Entradas que se autenticam sozinhas ou que precisam abrir sem sessão:
 * a tela de entrada, o handler do Better Auth, as rotas de saúde do Railway,
 * as rotinas agendadas (Bearer) e o link de descadastro (token assinado).
 * Todo o resto exige sessão; papel e duas etapas são conferidos no layout e em
 * cada ação, direto no banco.
 */
const PUBLIC_PREFIXES = [
  "/entrar",
  "/sem-acesso",
  "/api/auth",
  "/api/health",
  "/api/ready",
  "/api/jobs",
  "/api/email",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function cspHeader(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind e os componentes injetam estilos em tempo de execução.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (!isPublic(pathname)) {
    const session = await getAuth().getSession(request.headers);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/entrar";
      url.search = "";
      if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64").replace(/=+$/, "");
  const csp = cspHeader(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)"],
};

export default proxy;
