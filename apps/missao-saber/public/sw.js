/**
 * Service worker do Missão Saber.
 *
 * Guarda a casca do aplicativo — ícones, manifesto e os pacotes estáticos do
 * Next, todos com nome versionado — para que abrir o app instalado não dependa
 * da rede e para que uma queda de conexão mostre uma página explicativa em vez
 * do erro do navegador.
 *
 * O que ele DELIBERADAMENTE não guarda:
 *
 * - Qualquer resposta de `/api/`.
 * - Qualquer página autenticada. Missão, simulado, caderno e relatório
 *   descrevem o estudo de uma criança, e o aparelho da casa costuma ser
 *   compartilhado entre irmãos. Guardar esse HTML no disco do navegador deixa
 *   o percurso de um perfil legível a partir de outro.
 * - Fila de respostas offline. Responder sem rede exige uma política de
 *   conflito de tentativa, e o gabarito do simulado é do servidor por decisão
 *   de arquitetura.
 *
 * Trocar os nomes de cache abaixo invalida o que ficou, na próxima ativação.
 */
const CACHE = "missao-casca-v1";
const CASCA = ["/offline", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/* Os pacotes com hash vivem num cache separado da casca. Eles são a única
   parte que cresce sozinha: cada deploy publica nomes novos e os antigos
   nunca mais são pedidos, então o cache precisa de teto e de descarte — a
   casca, com quatro itens fixos, não precisa de nenhum dos dois. */
const PACOTES = "missao-pacotes-v1";
const LIMITE_PACOTES = 120;

async function guardarPacote(request, resposta) {
  try {
    const cache = await caches.open(PACOTES);
    await cache.put(request, resposta);
    // `keys()` devolve na ordem de inserção: os mais antigos saem primeiro.
    const chaves = await cache.keys();
    for (const antiga of chaves.slice(0, Math.max(0, chaves.length - LIMITE_PACOTES)))
      await cache.delete(antiga);
  } catch {
    // Cota cheia ou cache indisponível: seguir pela rede é resposta suficiente.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` falha inteira se um item falhar; a casca é pequena e pública,
      // mas uma instalação sem rede não pode derrubar o registro.
      .then((cache) => Promise.allSettled(CASCA.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome !== CACHE && nome !== PACOTES)
            .map((nome) => caches.delete(nome)),
        ),
      )
      // A página de falha referencia pacotes com hash do build. Buscá-la de novo
      // a cada ativação evita servir um documento que aponta para arquivos que
      // o deploy seguinte já apagou. Se este arquivo mudar de bytes, `CACHE`
      // também deve mudar, para o cache antigo sair inteiro.
      .then(() =>
        caches
          .open(CACHE)
          .then((cache) => cache.add("/offline"))
          .catch(() => undefined),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pacotes do Next têm nome com hash: o conteúdo nunca muda para a mesma URL.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(PACOTES).then((cache) =>
        cache.match(request).then(
          (guardado) =>
            guardado ??
            fetch(request)
              .then((resposta) => {
                if (resposta.ok) {
                  const copia = resposta.clone();
                  // Sob `waitUntil` para a gravação não ser cortada quando o
                  // worker é encerrado logo depois de responder.
                  event.waitUntil(guardarPacote(request, copia));
                }
                return resposta;
              })
              // Sem rede e sem cópia: uma resposta clara, não uma promessa
              // rejeitada, que o navegador mostraria como erro de rede solto.
              .catch(
                () =>
                  new Response("Recurso indisponível sem conexão.", {
                    status: 503,
                    headers: { "content-type": "text/plain; charset=utf-8" },
                  }),
              ),
        ),
      ),
    );
    return;
  }

  // Navegação: sempre da rede. Sem rede, a página de fallback — nunca uma
  // cópia guardada de tela autenticada.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then(
          (guardado) =>
            guardado ??
            new Response("Sem conexão.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        ),
      ),
    );
  }
});
