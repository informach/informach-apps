import type Anthropic from "@anthropic-ai/sdk";
import { buildRequest } from "../shared/aiModels.ts";

/**
 * One answer of the Anthropic API for runOneShot (main/oneShot.ts): streamed, as the SDK asks for
 * requests that may take long (a batch of 150 captions), and read whole at the end. Apart from
 * oneShot.ts so it can be tried against a local fake server.
 */
export async function apiOneShot(
  client: Anthropic,
  model: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const message = await client.beta.messages
    .stream(
      {
        ...buildRequest(model, "low"),
        max_tokens: 32000,
        messages: [{ role: "user", content: prompt }],
      },
      { signal },
    )
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("O Claude não pôde atender.");
  return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}
