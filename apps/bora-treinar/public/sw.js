/**
 * Service worker do Bora Treinar.
 *
 * Guarda a casca do aplicativo — ícone, manifesto e os pacotes estáticos do
 * Next, todos com nome versionado — e o detector de pose do MediaPipe, que é
 * grande e não muda entre visitas. Assim o app instalado abre e conta pela
 * câmera mesmo com a rede ruim, e uma queda de conexão mostra uma página
 * explicativa em vez do erro do navegador.
 *
 * O que ele DELIBERADAMENTE não guarda:
 *
 * - Qualquer resposta de `/api/`.
 * - Qualquer página autenticada. Progresso, recordes e nomes dos perfis são da
 *   família, e o aparelho da casa costuma ser compartilhado. Treinos feitos sem
 *   rede ficam numa fila própria do player (IndexedDB) até poderem ser salvos.
 *
 * Trocar os nomes de cache abaixo invalida o que ficou, na próxima ativação.
 */
const CACHE = "bora-casca-v1";
const CASCA = ["/offline", "/manifest.webmanifest", "/icon.svg"];
/* WASM e modelo de pose: nomes fixos, conteúdo conferido por hash no build. */
const DETECTOR = "bora-detector-v1";

/* Os pacotes com hash vivem num cache separado da casca. Eles são a única
   parte que cresce sozinha: cada deploy publica nomes novos e os antigos
   nunca mais são pedidos, então o cache precisa de teto e de descarte — a
   casca, com quatro itens fixos, não precisa de nenhum dos dois. */
const PACOTES = "bora-pacotes-v1";
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
            .filter((nome) => nome !== CACHE && nome !== PACOTES && nome !== DETECTOR)
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

  if (url.pathname.startsWith("/mediapipe/")) {
    event.respondWith(
      caches.open(DETECTOR).then((cache) =>
        cache.match(request).then(
          (guardado) =>
            guardado ??
            fetch(request).then((resposta) => {
              if (resposta.ok) {
                const copia = resposta.clone();
                event.waitUntil(cache.put(request, copia).catch(() => undefined));
              }
              return resposta;
            }),
        ),
      ),
    );
    return;
  }

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
