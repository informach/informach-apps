/**
 * As rotas do app chamadas dentro do processo, sem servidor: o teste monta um
 * `Request` e este despachante chama a função exportada pelo `route.ts`
 * correspondente, como o Next faria. Serve de `fetch` para o
 * `criarClienteDoHost` e para os pedidos do SDK nos testes de integração.
 *
 * Só entram aqui rotas que não dependem do cookie do portal. A do ingresso
 * precisa do contexto de pedido do Next e é testada pelo serviço; a do aceite
 * de convite entra pelo caminho do token da sessão de jogo.
 */

type Contexto = { params: Promise<{ id: string }> };
type Manipulador = (request: Request, contexto: Contexto) => Response | Promise<Response>;
type Modulo = Partial<Record<"GET" | "POST" | "PUT", Manipulador>>;

const ID = "([^/]+)";

const ROTAS: readonly [RegExp, () => Promise<Modulo>][] = [
  [/^\/api\/sdk\/v1\/jwks$/, () => import("@/app/api/sdk/v1/jwks/route")],
  [/^\/api\/sdk\/v1\/sessao$/, () => import("@/app/api/sdk/v1/sessao/route")],
  [/^\/api\/sdk\/v1\/sessao\/renovar$/, () => import("@/app/api/sdk/v1/sessao/renovar/route")],
  [/^\/api\/sdk\/v1\/sessao\/sair$/, () => import("@/app/api/sdk/v1/sessao/sair/route")],
  [/^\/api\/sdk\/v1\/mundos$/, () => import("@/app/api/sdk/v1/mundos/route")],
  [
    new RegExp(`^/api/sdk/v1/mundos/${ID}/convites$`),
    () => import("@/app/api/sdk/v1/mundos/[id]/convites/route"),
  ],
  [
    new RegExp(`^/api/sdk/v1/mundos/${ID}/abrir$`),
    () => import("@/app/api/sdk/v1/mundos/[id]/abrir/route"),
  ],
  [/^\/api\/sdk\/v1\/convites\/aceitar$/, () => import("@/app/api/sdk/v1/convites/aceitar/route")],
  [/^\/api\/interno\/v1\/instancias$/, () => import("@/app/api/interno/v1/instancias/route")],
  [
    new RegExp(`^/api/interno/v1/instancias/${ID}/batimento$`),
    () => import("@/app/api/interno/v1/instancias/[id]/batimento/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/instancias/${ID}/drenar$`),
    () => import("@/app/api/interno/v1/instancias/[id]/drenar/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/posse/reivindicar$`),
    () => import("@/app/api/interno/v1/mundos/[id]/posse/reivindicar/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/posse/liberar$`),
    () => import("@/app/api/interno/v1/mundos/[id]/posse/liberar/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/fotografia$`),
    () => import("@/app/api/interno/v1/mundos/[id]/fotografia/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/fotografias$`),
    () => import("@/app/api/interno/v1/mundos/[id]/fotografias/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/diario$`),
    () => import("@/app/api/interno/v1/mundos/[id]/diario/route"),
  ],
  [
    new RegExp(`^/api/interno/v1/mundos/${ID}/entradas$`),
    () => import("@/app/api/interno/v1/mundos/[id]/entradas/route"),
  ],
  [/^\/api\/jobs\/manutencao$/, () => import("@/app/api/jobs/manutencao/route")],
];

export const ORIGEM = "http://localhost:3009";

/** Um `fetch` que entrega o pedido à rota do app, no mesmo processo. */
export async function despachar(url: string, init?: RequestInit): Promise<Response> {
  const pedido = new Request(url, init);
  const caminho = new URL(pedido.url).pathname;
  for (const [padrao, carregar] of ROTAS) {
    const casou = padrao.exec(caminho);
    if (!casou) continue;
    const modulo = await carregar();
    const manipulador = modulo[pedido.method as keyof Modulo];
    if (!manipulador) return new Response(null, { status: 405 });
    return manipulador(pedido, {
      params: Promise.resolve({ id: decodeURIComponent(casou[1] ?? "") }),
    });
  }
  return new Response(null, { status: 404 });
}

/** Um pedido JSON a uma rota do SDK ou das instâncias, com o que a resposta trouxe. */
export async function pedir(
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  opcoes: { token?: string; corpo?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await despachar(`${ORIGEM}${caminho}`, {
    method: metodo,
    headers: {
      ...(opcoes.token === undefined ? {} : { authorization: `Bearer ${opcoes.token}` }),
      ...(opcoes.corpo === undefined ? {} : { "content-type": "application/json" }),
      ...opcoes.headers,
    },
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : {} };
}
