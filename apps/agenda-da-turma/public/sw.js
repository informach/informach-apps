/*
 * Service worker da Agenda da Turma.
 *
 * Faz DUAS coisas, e é importante saber quais não faz:
 *
 *   1. Push — mostra o lembrete e abre a janela no clique.
 *   2. Leitura offline do ESQUELETO — os assets versionados do Next e uma
 *      página de "sem conexão" para quando a navegação falha.
 *
 * O que ele deliberadamente NÃO faz é guardar HTML autenticado. A rotina de uma
 * família é dado sensível, e um aparelho é compartilhado: uma página em cache
 * sobreviveria ao logout e poderia aparecer para a próxima pessoa que abrisse o
 * app. Por isso navegação é sempre rede, e o cache só recebe o que é igual para
 * todo mundo — `/_next/static/*`, que já vem com hash no nome, os ícones e o
 * manifesto.
 *
 * Também não há fila de escrita. Concluir uma atividade usa `version` para
 * concorrência otimista: repetir uma gravação enfileirada depois que outra
 * pessoa editou não é "tentar de novo", é decidir por ela. Uma fila honesta
 * precisa de endpoint idempotente próprio e de uma tela que mostre o que não
 * subiu — está descrito na proposta como trabalho próprio, e não foi feito
 * aqui. Enquanto isso, a barra de "sem conexão" do app diz o que é verdade:
 * dá para ler, e as mudanças esperam a rede.
 */

const CACHE = "agenda-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/web-app-manifest-192x192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` para não herdar uma resposta velha do cache HTTP na instalação.
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Só o que é idêntico para toda conta pode ser guardado. */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // Os chunks do Next trazem hash no nome: são imutáveis e não têm dado de
  // ninguém dentro.
  if (url.pathname.startsWith("/_next/static/")) return true;
  return PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API e rotas de autenticação nunca passam por aqui.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Sempre rede. A resposta NÃO é guardada: é HTML da família.
          return await fetch(request);
        } catch {
          const cached = await caches.match(OFFLINE_URL);
          return (
            cached ??
            new Response("Sem conexão.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      // Só respostas boas e da própria origem entram. `opaque` ficaria de fora
      // de qualquer forma pelo teste de origem acima.
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    /* A visible generic notification still reaches the user. */
  }
  const url =
    typeof message.url === "string" && /^\/(dashboard|recados)(\/|$)/.test(message.url)
      ? message.url
      : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(
      typeof message.title === "string" ? message.title : "Agenda da Turma",
      {
        body: "Abra a Agenda da Turma para conferir as providências.",
        icon: "/web-app-manifest-192x192.png",
        tag: typeof message.tag === "string" ? message.tag : "agenda-routine",
        data: { url },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin);
  event.waitUntil(
    self.clients.openWindow(target.origin === self.location.origin ? target.href : "/dashboard"),
  );
});
