import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { frameLabel, labelImage, pruneImages } from "../src/main/historyImages.ts";

type Param = Anthropic.Beta.BetaMessageParam;

const frame = (id: string, seconds: number): Param[] => [
  {
    role: "assistant",
    content: [{ type: "tool_use", id, name: "get_frame", input: { time: seconds } }],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: id,
        content: [
          { type: "text", text: "Quadro" },
          labelImage(
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
            frameLabel(seconds),
          ),
        ],
      },
    ],
  },
];

test("only the newest pictures stay in the API history; older ones become their frame's line", () => {
  const messages: Param[] = [{ role: "user", content: "Olhe a aula" }];
  for (let i = 0; i < 6; i++) messages.push(...frame(`t${i}`, 60 + i * 5));
  assert.equal(pruneImages(messages, 4), 2);
  const parts = messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.flatMap((b) =>
          b.type === "tool_result" && Array.isArray(b.content) ? b.content : [],
        )
      : [],
  );
  assert.equal(parts.filter((p) => p.type === "image").length, 4);
  const texts = parts.flatMap((p) => (p.type === "text" ? [p.text] : []));
  assert.ok(texts.includes("[quadro de 1:00]") && texts.includes("[quadro de 1:05]"));
  assert.ok(!texts.includes("[quadro de 1:10]"));
  // Calls and results stay paired.
  assert.equal(messages.length, 13);
  assert.equal(pruneImages(messages, 4), 0);
});
