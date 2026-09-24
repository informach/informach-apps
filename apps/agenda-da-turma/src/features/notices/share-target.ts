/**
 * Lê o que o sistema compartilhou com a Agenda.
 *
 * O service worker guarda o POST do `share_target` no IndexedDB e manda a
 * navegação para `/recados/novo?modo=compartilhado`; aqui a tela vem buscar,
 * uma vez, e apaga. Nada foi para servidor nenhum até este ponto: quem envia
 * para a leitura é a pessoa, depois de conferir.
 */
const SHARE_DB = "agenda-share";
const SHARE_STORE = "payload";
const SHARE_KEY = "pending";
/** Compartilhamento esquecido no aparelho não reaparece dias depois. */
const MAX_AGE_MS = 10 * 60_000;

export type SharedPayload = {
  title: string;
  text: string;
  url: string;
  file: { name: string; type: string; blob: Blob } | null;
  receivedAt: number;
};

function openShareDb(): Promise<IDBDatabase> {
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

/**
 * A leitura é destrutiva, então o resultado fica guardado no módulo.
 *
 * O StrictMode monta, desmonta e monta de novo: a primeira chamada consumiria o
 * registro e o descartaria, e a segunda não acharia nada — o compartilhamento
 * morria em desenvolvimento e em qualquer remontagem de verdade. Guardar a
 * promessa faz as duas chamadas verem o mesmo conteúdo.
 */
let pending: Promise<SharedPayload | null> | null = null;

/** Devolve o compartilhamento pendente e o remove. Null quando não há. */
export function takeSharedPayload(now = Date.now()): Promise<SharedPayload | null> {
  pending ??= readSharedPayload(now);
  return pending;
}

async function readSharedPayload(now: number): Promise<SharedPayload | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openShareDb();
    const payload = await new Promise<SharedPayload | null>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, "readwrite");
      const store = tx.objectStore(SHARE_STORE);
      const read = store.get(SHARE_KEY);
      read.onsuccess = () => {
        store.delete(SHARE_KEY);
        resolve((read.result as SharedPayload | undefined) ?? null);
      };
      read.onerror = () => reject(read.error);
    });
    db.close();
    if (!payload || now - payload.receivedAt > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

/** O texto do recado a partir do que veio compartilhado. */
export function sharedPayloadText(payload: SharedPayload): string {
  return (
    [payload.title, payload.text, payload.url]
      .map((part) => part.trim())
      .filter(Boolean)
      // Título e texto costumam vir iguais quando o app de origem repete os dois.
      .filter((part, index, all) => all.indexOf(part) === index)
      .join("\n")
  );
}
