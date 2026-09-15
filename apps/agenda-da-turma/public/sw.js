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
 * família é dado sensível e um aparelho é compartilhado: uma página em cache
 * sobreviveria ao logout e poderia aparecer para a próxima pessoa que abrisse o
 * app. Por isso navegação é sempre rede, e o cache só recebe o que é igual para
 * todo mundo — `/_next/static/*`, que já vem com hash no nome, e a página
 * `/offline`.
 *
 * Também não há fila de escrita. Concluir uma atividade usa `version` para
 * concorrência otimista: repetir uma gravação enfileirada depois que outra
 * pessoa editou não é "tentar de novo", é decidir por ela. Uma fila honesta
 * precisa de endpoint idempotente próprio e de uma tela que mostre o que não
 * subiu — está descrito na proposta como trabalho próprio, e não foi feito
 * aqui. Enquanto isso, a barra de "sem conexão" do app diz o que é verdade:
 * dá para ler, e marcar como feito precisa de rede.
 */

/**
 * INTERRUPTOR.
 *
 * Publicar com `false` faz o próprio worker limpar os caches e se desregistrar
 * no próximo carregamento, voltando todo mundo para a rede direta.
 *
 * Existe porque este worker intercepta TODA navegação de TODOS os usuários
 * desde que o registro saiu do painel de push e foi para o layout. Um defeito
 * no `fetch` deixou de ser problema de uma minoria opt-in; sem este caminho, a
 * saída seria pedir "limpar dados do site" para a base inteira.
 */
const ENABLED = true;

/**
 * A versão vai no NOME do cache, e `activate` apaga todo cache com nome
 * diferente. Bumpe ao mudar o que é guardado ou como.
 */
const CACHE = "agenda-shell-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/web-app-manifest-192x192.png"];

/**
 * Teto de entradas do cache de assets.
 *
 * Sem ele, cada deploy somava um conjunto novo de chunks ao anterior, para
 * sempre — e num celular com cota apertada o navegador despeja o cache
 * INTEIRO, inclusive `/offline`, e a feature morre sem sinal nenhum. Com teto,
 * quem sai é a entrada mais antiga, e o precache é reposto no `activate`.
 */
const MAX_ASSET_ENTRIES = 120;

async function precache() {
  const cache = await caches.open(CACHE);
  // `reload` para não herdar uma resposta velha do cache HTTP.
  await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
}

async function dropEverything() {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

async function trimAssets() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const assets = keys.filter((request) => new URL(request.url).pathname.startsWith("/_next/"));
  const excess = assets.length - MAX_ASSET_ENTRIES;
  // `cache.keys()` devolve na ordem de inserção: as primeiras são as mais velhas.
  for (let i = 0; i < excess; i += 1) {
    const stale = assets[i];
    if (stale) await cache.delete(stale);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (ENABLED) await precache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (!ENABLED) {
        await dropEverything();
        await self.registration.unregister();
        return;
      }
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      // Repor o precache AQUI, e não só no `install`: numa sequência de deploys
      // que não toque nos bytes do `sw.js`, `install` não roda de novo e a
      // família receberia offline o `/offline` de meses atrás.
      await precache();
      await trimAssets();
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
  if (!ENABLED) return;
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
        await cache.put(request, response.clone());
        await trimAssets();
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
