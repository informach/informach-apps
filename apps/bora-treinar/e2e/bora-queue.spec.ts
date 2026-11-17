import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";

// Compile the real queue module; IndexedDB, transactions and schema upgrades run in Chromium.
type Queue = typeof import("../src/features/sessoes/fila");
declare global {
  interface Window {
    BoraQueue: Queue;
  }
}

test("Bora offline queue isolates adults and families, migrates v3 and preserves pending writes", async ({
  page,
}) => {
  test.skip(process.env.COMPASSO_TEST_APP !== "bora-treinar", "Bora queue journey");
  await page.route("https://queue.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Isolated queue</title>",
    }),
  );
  await page.goto("https://queue.example.test/");
  const ids = await page.evaluate(async () => {
    const ids = Array.from({ length: 7 }, () => crypto.randomUUID());
    const request = indexedDB.open("bora-fila", 30); // Dexie v3 uses IDB version 30.
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("pendentes", { keyPath: "id" });
      store.createIndex("criadoEm", "criadoEm");
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction("pendentes", "readwrite");
    tx.objectStore("pendentes").put({
      id: ids[0],
      payload: { id: ids[0], profileId: ids[6] },
      criadoEm: 1,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
    return ids;
  });
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/features/sessoes/fila.ts", import.meta.url))],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "BoraQueue",
  });
  await page.addScriptTag({ content: bundle.outputFiles[0]?.text ?? "" });
  const result = await page.evaluate(async (ids) => {
    const queue = window.BoraQueue;
    const idAt = (index: number) => {
      const value = ids[index];
      if (!value) throw new Error("Missing isolated queue identifier");
      return value;
    };
    const scope = { actorId: "original-adult", familyGroupId: idAt(1) };
    const otherFamily = { ...scope, familyGroupId: idAt(2) };
    const otherAdult = { ...scope, actorId: "another-adult" };
    const payload = (id: string) => ({
      id,
      profileId: idAt(6),
      workoutRef: "catalogo:primeiro-treino",
      startedAt: Date.now(),
      durationSeconds: 60,
      mode: "manual" as const,
      logs: [],
    });
    const unclaimed = await queue.listarPendentes(scope);
    const deniedRecovery = await queue.recuperarPendentesLegados(otherAdult, async () => []);
    const recovered = await queue.recuperarPendentesLegados(scope, async (candidates) =>
      candidates.map((item) => item.id),
    );
    await queue.guardarPendente(scope, payload(idAt(3)));
    await queue.guardarPendente(otherFamily, payload(idAt(4)));
    await queue.guardarPendente(otherAdult, payload(idAt(5)));
    let collisionDenied = false;
    try {
      await queue.guardarPendente(otherAdult, payload(idAt(3)));
    } catch {
      collisionDenied = true;
    }
    await queue.descartarPendente(otherAdult, idAt(3));
    const scopedRows = await queue.listarPendentes(scope);
    const sent: string[] = [];
    await queue.enviarPendentes(scope, async (input) => {
      const id = "sessoes" in input ? input.groupId : input.id;
      sent.push(id);
      // Discard while the server is answering. A denied response must not put it back.
      await queue.descartarPendente(scope, id);
      return { ok: false, code: "ACCESS_DENIED" };
    });
    const afterDiscard = await queue.listarPendentes(scope);
    const otherFamilyRows = await queue.listarPendentes(otherFamily);
    const otherAdultRows = await queue.listarPendentes(otherAdult);
    const stopped = await queue.enviarPendentes(
      otherFamily,
      async () => ({ ok: true }),
      () => false,
    );
    const retry = await queue.enviarPendentes(otherAdult, async () => {
      throw new Error("Offline");
    });
    return {
      unclaimed,
      deniedRecovery,
      recovered,
      collisionDenied,
      scopedIds: scopedRows.map((row) => row.id),
      sent,
      afterDiscard,
      otherFamilyIds: otherFamilyRows.map((row) => row.id),
      otherAdultIds: otherAdultRows.map((row) => row.id),
      stopped,
      retry,
      stillPending: await queue.contarPendentes(otherAdult),
      version: await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("bora-fila");
        request.onsuccess = () => {
          resolve(request.result.version);
          request.result.close();
        };
        request.onerror = () => reject(request.error);
      }),
    };
  }, ids);
  expect(result).toMatchObject({
    unclaimed: [],
    deniedRecovery: 0,
    recovered: 1,
    collisionDenied: true,
    scopedIds: [ids[0], ids[3]],
    sent: [ids[0], ids[3]],
    afterDiscard: [],
    otherFamilyIds: [ids[4]],
    otherAdultIds: [ids[5]],
    stopped: 0,
    retry: 0,
    stillPending: 1,
    version: 40,
  });
});
