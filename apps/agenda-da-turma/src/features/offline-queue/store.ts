import type { PendingWrite } from "./queue";

/**
 * A fila no aparelho.
 *
 * IndexedDB, sem biblioteca, no mesmo feitio de `features/notices/share-target.ts`
 * — o app já tem um armazém assim e um segundo estilo só criaria duas formas de
 * errar. Nada aqui lança para quem chama: um navegador em aba anônima, com
 * dados do site bloqueados, ou uma cota estourada devolvem uma fila vazia, e o
 * app volta a se comportar como se não houvesse fila. É pior do que ter fila, e
 * é muito melhor do que uma tela que quebra ao marcar "feito".
 *
 * **As entradas não são da sessão, são da origem.** Cada uma carrega o
 * `userId` de quem decidiu, e quem lê filtra (`visibleForOwner`). Sem isso, uma
 * gravação feita antes do logout subiria com a sessão de quem entrasse depois.
 */
const WRITES_DB = "agenda-writes";
const WRITES_STORE = "pending_writes";

/** Muda quando a fila muda. A barra, os cards e a folha escutam. */
export const QUEUE_CHANGED_EVENT = "agenda:queue-changed";

export function notifyQueueChanged() {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

/**
 * Uma conexão só, viva enquanto a aba estiver.
 *
 * Abrir e fechar por operação custava um `indexedDB.open` por card montado a
 * cada mudança da fila — vinte cards são vinte aberturas para responder à mesma
 * pergunta.
 */
let connection: Promise<IDBDatabase> | null = null;

function openWritesDb(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(WRITES_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WRITES_STORE))
        request.result.createObjectStore(WRITES_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      // Se o navegador fechar a conexão (outra aba pedindo upgrade, despejo por
      // cota), a próxima leitura abre de novo em vez de usar um objeto morto.
      request.result.onclose = () => {
        connection = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      connection = null;
      reject(request.error);
    };
  });
  return connection;
}

function available() {
  return typeof indexedDB !== "undefined";
}

/**
 * A leitura em curso, compartilhada.
 *
 * Uma mudança da fila acorda todos os cards montados de uma vez; sem este
 * cache eles fariam N leituras idênticas no mesmo tique. `notifyQueueChanged`
 * o invalida, então ninguém lê versão velha.
 */
let cached: Promise<PendingWrite[]> | null = null;

export function listPendingWrites(): Promise<PendingWrite[]> {
  cached ??= readAll();
  return cached;
}

async function readAll(): Promise<PendingWrite[]> {
  if (!available()) return [];
  try {
    const db = await openWritesDb();
    const entries = await new Promise<PendingWrite[]>((resolve, reject) => {
      const request = db.transaction(WRITES_STORE, "readonly").objectStore(WRITES_STORE).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as PendingWrite[]);
      request.onerror = () => reject(request.error);
    });
    return entries.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function savePendingWrite(entry: PendingWrite): Promise<boolean> {
  const done = await write((store) => {
    store.put(entry);
  });
  cached = null;
  return done;
}

export async function deletePendingWrite(key: string): Promise<boolean> {
  const done = await write((store) => {
    store.delete(key);
  });
  cached = null;
  return done;
}

/**
 * Regrava uma entrada **se ela ainda existir**, na mesma transação.
 *
 * É o que impede um esvaziamento em curso de ressuscitar o que a pessoa acabou
 * de descartar: a leitura e a gravação acontecem dentro de uma transação só, e
 * a entrada apagada simplesmente não é recriada.
 */
export async function updatePendingWriteIfPresent(entry: PendingWrite): Promise<boolean> {
  const done = await write((store) => {
    const request = store.get(entry.key);
    request.onsuccess = () => {
      if (request.result) store.put(entry);
    };
  });
  cached = null;
  return done;
}

async function write(run: (store: IDBObjectStore) => void): Promise<boolean> {
  if (!available()) return false;
  try {
    const db = await openWritesDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(WRITES_STORE, "readwrite");
      run(tx.objectStore(WRITES_STORE));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}
