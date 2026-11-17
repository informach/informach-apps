import assert from "node:assert/strict";
import { test } from "node:test";
import { duration, notifyPipelineEnd, ntfyTarget, parseNotice } from "./pipelineNotify.ts";

const quiet = <T>(run: () => T): T => {
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    return run();
  } finally {
    console.warn = warn;
  }
};

test("pipeline notice: off without a topic, and only to https (or this computer)", () => {
  assert.equal(ntfyTarget({}), null);
  assert.deepEqual(ntfyTarget({ EDISVG_NTFY_TOPIC: "meu-topico_1" }), {
    server: "https://ntfy.sh",
    topic: "meu-topico_1",
  });
  assert.deepEqual(
    ntfyTarget({ EDISVG_NTFY_TOPIC: "t", EDISVG_NTFY_SERVER: "http://localhost:8080/" }),
    { server: "http://localhost:8080", topic: "t" },
  );
  quiet(() => {
    assert.equal(ntfyTarget({ EDISVG_NTFY_TOPIC: "t/../x" }), null);
    assert.equal(
      ntfyTarget({ EDISVG_NTFY_TOPIC: "t", EDISVG_NTFY_SERVER: "http://ntfy.sh" }),
      null,
    );
    assert.equal(ntfyTarget({ EDISVG_NTFY_TOPIC: "t", EDISVG_NTFY_SERVER: "ntfy" }), null);
  });
});

test("pipeline notice: what the window sends is checked", () => {
  assert.throws(() => parseNotice({ ok: true, recipe: "x" }), /inválido/);
  assert.throws(() => parseNotice({ ok: true, recipe: "x", seconds: -1 }), /inválido/);
  assert.equal(parseNotice({ ok: false, recipe: "r".repeat(500), seconds: 3 }).recipe.length, 120);
  assert.equal(duration(42.4), "42 s");
  assert.equal(duration(120), "2 min");
  assert.equal(duration(725), "12 min 5 s");
});

test("pipeline notice: one JSON post to the server, and a failure stops nothing", async () => {
  const sent: { url: string; body: unknown }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}");
  }) as typeof fetch;
  const env = { EDISVG_NTFY_TOPIC: "meu-topico" };
  assert.equal(
    await notifyPipelineEnd({ ok: true, recipe: "Cena do jogo", seconds: 95 }, env, ok),
    true,
  );
  assert.deepEqual(sent, [
    {
      url: "https://ntfy.sh",
      body: {
        topic: "meu-topico",
        title: "EdiSVG: pipeline pronto",
        message: "Cena do jogo · 1 min 35 s",
        tags: ["white_check_mark"],
        priority: 3,
      },
    },
  ]);
  assert.equal(await notifyPipelineEnd({ ok: true, recipe: "x", seconds: 1 }, {}, ok), false);
  assert.equal(sent.length, 1);
  const down = (async () => new Response("", { status: 500 })) as typeof fetch;
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await notifyPipelineEnd({ ok: false, recipe: "x", seconds: 1 }, env, down), false);
    assert.equal(await notifyPipelineEnd("lixo", env, ok), false);
  } finally {
    console.warn = warn;
  }
  assert.equal(sent.length, 1);
});
