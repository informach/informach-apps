/**
 * A política de segurança de conteúdo do portal, montada num lugar só. Sem
 * ambiente e sem Next, para ser testada direto; quem a entrega é `proxy.ts`.
 *
 * Todas as páginas recebem a política do portal. A página que hospeda um jogo
 * (`/jogar/<jogo>`) recebe a mesma política com o que um jogo em WebGL com
 * WebSocket precisa, e nada além disso.
 */

/** As origens de um jogo, como `RECREIO_GAME_ORIGINS` as guarda. */
export type OrigensParaCsp = { ws: string; assets?: string };

/** O id do jogo de um caminho `/jogar/<jogo>`, ou `null` para qualquer outro caminho. */
export function jogoDoCaminho(caminho: string): string | null {
  const achado = /^\/jogar\/([^/]+)\/?$/.exec(caminho);
  if (!achado?.[1]) return null;
  try {
    return decodeURIComponent(achado[1]);
  } catch {
    return null;
  }
}

/**
 * Uma origem que pode entrar na política: só esquema e host. O valor vem do
 * ambiente, já validado; conferir de novo aqui impede que um `;` ou um espaço
 * abra outra diretiva.
 */
function origemSegura(valor: string, esquemas: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (!esquemas.includes(url.protocol)) return null;
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  const origem = `${url.protocol}//${url.host}`;
  return /^[a-z]+:\/\/[A-Za-z0-9.[\]:-]+$/.test(origem) ? origem : null;
}

export function montarCsp(opcoes: {
  nonce: string;
  /** `next dev`: o recarregamento do Next precisa de `eval` e de WebSocket. */
  dev: boolean;
  /** Só na página que hospeda um jogo: as origens daquele jogo. */
  jogo?: OrigensParaCsp | null;
}): string {
  const { nonce, dev } = opcoes;
  if (!opcoes.jogo)
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "worker-src 'self'",
      `connect-src 'self'${dev ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");

  const ws = origemSegura(opcoes.jogo.ws, ["ws:", "wss:"]);
  const arte =
    opcoes.jogo.assets === undefined ? null : origemSegura(opcoes.jogo.assets, ["http:", "https:"]);
  const comArte = arte ? ` ${arte}` : "";
  return [
    "default-src 'self'",
    // `wasm-unsafe-eval` deixa compilar WebAssembly (decodificadores de malha e
    // de textura) sem liberar `eval` de texto.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Texturas e imagens que o jogo monta na memória.
    `img-src 'self' data: blob:${comArte}`,
    `media-src 'self' data: blob:${comArte}`,
    "font-src 'self'",
    // Os decodificadores rodam em workers criados a partir de um blob.
    "worker-src 'self' blob:",
    // GLTFLoader/ImageBitmapLoader lê texturas embutidas com fetch(blob:).
    // Essa leitura só é necessária quando o jogo declara a origem da arte.
    `connect-src 'self'${ws ? ` ${ws}` : ""}${comArte}${arte ? " blob:" : ""}${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}
