/*
 * Service worker da Agenda da Turma.
 *
 * Faz QUATRO coisas, e é importante saber quais não faz:
 *
 *   1. Push — mostra o lembrete e abre a janela no clique.
 *   2. Leitura offline do ESQUELETO — os assets versionados do Next e uma
 *      página de "sem conexão" para quando a navegação falha.
 *   3. Receber o que o sistema compartilhou — a única exceção ao "só GET".
 *   4. Avisar as janelas abertas quando a conectividade volta (`sync`), para
 *      que a fila de gravações do aparelho suba.
 *
 * O que ele deliberadamente NÃO faz é guardar HTML autenticado. A rotina de uma
 * família é dado sensível e um aparelho é compartilhado: uma página em cache
 * sobreviveria ao logout e poderia aparecer para a próxima pessoa que abrisse o
 * app. Por isso navegação é sempre rede, e o cache só recebe o que é igual para
 * todo mundo — `/_next/static/*`, que já vem com hash no nome, e a página
 * `/offline`.
 *
 * A fila de escrita existe, e NÃO mora aqui. O worker só avisa; quem guarda,
 * envia e mostra o que não subiu é `features/offline-queue`, na janela. A
 * divisão é deliberada: enviar daqui obrigaria a repetir dentro do worker a
 * sessão, a chave de idempotência e a leitura da resposta, e duas cópias dessa
 * decisão é exatamente o tipo de divergência que faz uma conclusão sumir. O
 * preço é conhecido: sem janela aberta, a fila espera o app abrir de novo.
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
const CACHE = "agenda-shell-v3";
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

/** Guarda o compartilhamento recebido até a tela de revisão vir buscá-lo. */
const SHARE_DB = "agenda-share";
const SHARE_STORE = "payload";
const SHARE_KEY = "pending";

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARE_STORE))
        request.result.createObjectStore(SHARE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSharedPayload(payload) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, "readwrite");
    tx.objectStore(SHARE_STORE).put(payload, SHARE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Recebe o que o sistema compartilhou e devolve a navegação para a revisão.
 *
 * Nada sai do aparelho aqui: o conteúdo fica no IndexedDB até a tela abrir, e
 * quem manda para a leitura é a pessoa, depois de conferir.
 */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("arquivos").filter((item) => item instanceof File && item.size > 0);
    // Uma só, e dentro do limite do recado: descartar aqui é melhor do que
    // falhar depois da navegação.
    const file = files.find((item) => item.size <= 5 * 1024 * 1024);
    await saveSharedPayload({
      title: String(form.get("title") ?? ""),
      text: String(form.get("text") ?? ""),
      url: String(form.get("url") ?? ""),
      file: file ? { name: file.name, type: file.type, blob: file } : null,
      receivedAt: Date.now(),
    });
  } catch {
    // Sem payload a tela abre vazia, que é melhor do que um erro do navegador.
  }
  return Response.redirect("/recados/novo?modo=compartilhado", 303);
}
self.addEventListener("fetch", (event) => {
  if (!ENABLED) return;
  const { request } = event;
  if (
    request.method === "POST" &&
    new URL(request.url).origin === self.location.origin &&
    new URL(request.url).pathname === "/recados/compartilhar"
  ) {
    event.respondWith(receiveShare(request));
    return;
  }
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

/**
 * A conectividade voltou.
 *
 * O Background Sync entrega este evento quando a rede volta, mesmo que a aba
 * tenha sido fechada há pouco. A resposta é só um recado para quem estiver
 * aberto: quem sabe enviar é a janela. Sem nenhuma janela, o `sync` termina sem
 * fazer nada e a fila sobe na próxima abertura do app — é a consequência aceita
 * de não duplicar aqui a lógica de envio.
 */
self.addEventListener("sync", (event) => {
  if (!ENABLED || event.tag !== "agenda-flush") return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: "agenda-flush" });
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
  // Só caminhos do próprio app que um aviso abre: Hoje, um recado, uma
  // atividade e a semana. Qualquer outra coisa abre Hoje.
  const url =
    typeof message.url === "string" &&
    /^\/(dashboard|recados|atividades|calendario)(\/|\?|$)/.test(message.url)
      ? message.url
      : "/dashboard";
  // O texto vem do servidor já sem nome de criança nem conteúdo escolar (a
  // tela bloqueada é pública; ver `features/notifications/digest.ts`). O teto
  // de tamanho é defesa: um corpo inesperado não vira um parágrafo na tela.
  const body =
    typeof message.body === "string" && message.body.trim()
      ? message.body.trim().slice(0, 160)
      : "Abra a Agenda da Turma para conferir as atividades.";
  event.waitUntil(
    self.registration.showNotification(
      typeof message.title === "string" ? message.title : "Agenda da Turma",
      {
        body,
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
