import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { apiOneShot } from "../src/main/apiOneShot.ts";

/**
 * The "chave própria" engine of runOneShot against a local fake of the Messages API (no network):
 * the request is streamed (a long batch must not trip the SDK's non-streaming limit) and the
 * whole text comes back.
 */
test("apiOneShot streams the request and returns the whole answer", async () => {
  const seen: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => {
      body += c.toString();
    });
    req.on("end", () => {
      seen.push(JSON.parse(body) as Record<string, unknown>);
      const events: [string, unknown][] = [
        [
          "message_start",
          {
            type: "message_start",
            message: {
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-opus-5-5",
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 1 },
            },
          },
        ],
        [
          "content_block_start",
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        ],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: '{"cues":' },
          },
        ],
        [
          "content_block_delta",
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "[]}" } },
        ],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        [
          "message_delta",
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 5 },
          },
        ],
        ["message_stop", { type: "message_stop" }],
      ];
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [name, data] of events)
        res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const client = new Anthropic({
      apiKey: "sk-test",
      baseURL: `http://127.0.0.1:${port}`,
      maxRetries: 0,
    });
    const text = await apiOneShot(
      client,
      "claude-opus-5-5",
      "traduza",
      new AbortController().signal,
    );
    assert.equal(text, '{"cues":[]}');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].stream, true);
    assert.equal(seen[0].max_tokens, 32000);
    assert.equal(seen[0].model, "claude-opus-5-5");
  } finally {
    server.close();
  }
});
