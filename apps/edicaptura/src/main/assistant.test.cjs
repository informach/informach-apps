const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { configureDesktopAccess, mintRunToken } = require("@informach/edi-desktop/access");
const { createCaptureAssistant } = require("./assistant.ts");

// Real local MCP server and real run tokens; the engine is a stand-in that acts as the model
// would, over HTTP, without any real Claude Code/Codex or subscription.
configureDesktopAccess({ assertAccess() {} });
const IMAGE = "/9j/4AAQSkZJRg==";
const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
});
async function rpc(url, token, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}
function stand(script) {
  const runs = [];
  const engine = async (request) => {
    const run = mintRunToken({
      scopes: ["read", "propose"],
      ttlMs: 60_000,
      projectId: request.grantProject,
    });
    runs.push({ request, token: run.token });
    try {
      request.check();
      await script(request, run.token);
    } finally {
      run.revoke();
    }
  };
  return {
    runs,
    engines: { runClaudeCode: engine, runCodex: engine, stop: () => true },
  };
}
const capture = (extra = {}) => ({
  task: "capture-details",
  targetId: randomUUID(),
  name: "Captura 12",
  tags: [],
  image: IMAGE,
  text: "Painel de vendas outubro",
  ...extra,
});

test("o modelo só vê a tarefa ativa e propõe; a proposta chega validada", async () => {
  const events = [];
  let url;
  let outsider;
  const { engines } = stand(async (_request, token) => {
    const tools = await rpc(url, token, "tools/list", {});
    assert.deepEqual(tools.body.result.tools.map((tool) => tool.name).sort(), [
      "get_task",
      "propose_capture_details",
      "propose_guide_texts",
    ]);
    const task = await rpc(url, token, "tools/call", { name: "get_task", arguments: {} });
    const content = task.body.result.content;
    assert.match(content[0].text, /Painel de vendas outubro/);
    assert.equal(content[1].type, "image");
    assert.equal(content[1].data, IMAGE);
    // A token of another run (an outside client, an old task) sees no tool at all.
    const other = mintRunToken({
      scopes: ["read", "propose"],
      ttlMs: 60_000,
      projectId: randomUUID(),
    });
    outsider = await rpc(url, other.token, "tools/list", {});
    other.revoke();
    const wrong = await rpc(url, token, "tools/call", {
      name: "propose_guide_texts",
      arguments: { steps: [{ stepId: randomUUID(), title: "", description: "", alt: "" }] },
    });
    assert.equal(wrong.body.result.isError, true);
    const ok = await rpc(url, token, "tools/call", {
      name: "propose_capture_details",
      arguments: { title: "Painel de vendas de outubro", tags: ["vendas", "relatório"] },
    });
    assert.notEqual(ok.body.result.isError, true);
  });
  const assistant = createCaptureAssistant({
    engines,
    emit: (event) => events.push(event),
    version: "0",
  });
  try {
    url = await assistant.url();
    const { runId } = await assistant.start({ client: "claude-code", context: capture() });
    await waitFor(() => events.some((event) => event.type === "ended"));
    // Nothing is registered for it: an empty list or "method not found", never a tool.
    assert.ok(outsider.body.error || outsider.body.result.tools.length === 0);
    const proposal = events.find((event) => event.type === "proposal");
    assert.equal(proposal.runId, runId);
    assert.deepEqual(proposal.proposal, {
      title: "Painel de vendas de outubro",
      tags: ["vendas", "relatório"],
    });
    assert.deepEqual(
      events.filter((event) => event.type === "error"),
      [],
    );
  } finally {
    await assistant.close();
  }
});

test("parar encerra a autoridade: chamadas tardias são recusadas e nada é entregue", async () => {
  const events = [];
  let url;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const late = [];
  const { engines } = stand(async (_request, token) => {
    await blocked;
    late.push(await rpc(url, token, "tools/call", { name: "get_task", arguments: {} }));
    late.push(
      await rpc(url, token, "tools/call", {
        name: "propose_capture_details",
        arguments: { title: "Tarde demais", tags: [] },
      }),
    );
  });
  const assistant = createCaptureAssistant({
    engines,
    emit: (event) => events.push(event),
    version: "0",
  });
  try {
    url = await assistant.url();
    await assistant.start({ client: "codex", context: capture() });
    assert.equal(assistant.stop(), true);
    release();
    await waitFor(() => late.length === 2);
    for (const answer of late) {
      const result = answer.body?.result;
      // Refused: no tool offered (JSON-RPC error) or a tool error, never task content.
      assert.ok(answer.body?.error || result?.isError, JSON.stringify(answer.body));
      assert.doesNotMatch(JSON.stringify(answer.body), /Painel de vendas/);
    }
    assert.ok(!events.some((event) => event.type === "proposal"));
    assert.equal(events.filter((event) => event.type === "ended").length, 1);
  } finally {
    await assistant.close();
  }
});

test("tarefa de guia: só passos da tarefa e textos dentro dos limites", async () => {
  const assistant = createCaptureAssistant({
    engines: stand(async () => {}).engines,
    emit() {},
    version: "0",
  });
  const stepId = randomUUID();
  const context = {
    task: "guide-texts",
    targetId: randomUUID(),
    title: "Como salvar",
    steps: [{ stepId, title: "", description: "", alt: "", image: IMAGE }],
  };
  const { proposalFor } = require("../domain/assistant.ts");
  assert.deepEqual(
    proposalFor(context, "propose_guide_texts", {
      steps: [
        {
          stepId,
          title: "Abra o menu",
          description: "Clique em Arquivo.",
          alt: "Menu Arquivo aberto",
        },
      ],
    }).steps[0].alt,
    "Menu Arquivo aberto",
  );
  assert.throws(() =>
    proposalFor(context, "propose_guide_texts", {
      steps: [{ stepId: randomUUID(), title: "x", description: "", alt: "" }],
    }),
  );
  assert.throws(() =>
    proposalFor(context, "propose_guide_texts", {
      steps: [{ stepId, title: "x".repeat(201), description: "", alt: "" }],
    }),
  );
  assert.throws(() => proposalFor(context, "propose_capture_details", { title: "x" }));
  await assert.rejects(assistant.start({ client: "gpt", context }), /Cliente/);
  await assert.rejects(assistant.start({ client: "codex", context: { ...context, steps: [] } }));
  await assistant.close();
});

async function waitFor(condition, timeout = 10_000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error("Tempo esgotado.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
