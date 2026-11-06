/**
 * Service worker do Dia de Estrela.
 *
 * Guarda a casca do aplicativo (ícone, manifesto e os pacotes estáticos do
 * Next, todos com nome versionado) e mostra uma página explicativa quando a
 * rede cai. Também recebe os alertas por push dos pais.
 *
 * O que ele DELIBERADAMENTE não guarda: respostas de `/api/` e páginas
 * autenticadas. A rotina, as estrelas e os nomes são da família, e o tablet da
 * casa é compartilhado.
 *
 * Trocar os nomes de cache abaixo invalida o que ficou, na próxima ativação.
 */
const CACHE = "estrela-casca-v1";
const CASCA = ["/offline", "/manifest.webmanifest", "/icon.svg"];
const PACOTES = "estrela-pacotes-v1";
const LIMITE_PACOTES = 120;

async function guardarPacote(request, resposta) {
  try {
    const cache = await caches.open(PACOTES);
    await cache.put(request, resposta);
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
                  event.waitUntil(guardarPacote(request, copia));
                }
                return resposta;
              })
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

  // Navegação: sempre da rede. Sem rede, a página de fallback, nunca uma tela guardada.
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

/* Alertas aos pais. O texto vem do servidor sem nome de criança nem de tarefa;
   aqui ele é limitado de novo e o destino só pode ser uma página deste app. */
const DESTINOS = ["/inicio", "/rotinas", "/cofrinho", "/ajustes"];

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = String(dados.title || "Dia de Estrela").slice(0, 60);
  const corpo = String(dados.body || "Uma tarefa ainda não foi marcada.").slice(0, 160);
  const destino = DESTINOS.includes(dados.url) ? dados.url : "/inicio";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: String(dados.tag || "estrela").slice(0, 80),
      data: { url: destino },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = DESTINOS.includes(event.notification.data?.url)
    ? event.notification.data.url
    : "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin && "focus" in janela) {
          janela.navigate(destino).catch(() => undefined);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
