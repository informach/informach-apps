import "server-only";
import { z } from "zod";
import { AGENDA_AI_LIMITS } from "@/features/ai/costs";
import type { prepareNoticeAttachment } from "@/features/notices/attachment";
import { validateNoticeExtraction } from "@/features/notices/extraction";
import { noticeGenerationSchema } from "@/features/notices/schemas";
import { getNoticeParserAgent, NOTICE_INSTRUCTIONS } from "./agent";
import { buildNoticeUserMessage, type NoticeExtractionContext } from "./prompt";

// The production flow and the opt-in evaluation use this same extraction boundary.
export async function generateNoticeExtraction(
  input: { text: string; source: string; publishedAt: string | null },
  attachment: Awaited<ReturnType<typeof prepareNoticeAttachment>>,
  context: NoticeExtractionContext,
) {
  const content = buildNoticeUserMessage(input, attachment?.pages, context);
  const fixedBytes =
    Buffer.byteLength(
      NOTICE_INSTRUCTIONS + JSON.stringify(z.toJSONSchema(noticeGenerationSchema)) + content,
      "utf8",
    ) -
    Buffer.byteLength(input.text, "utf8") +
    2048;
  if (fixedBytes > AGENDA_AI_LIMITS.fixedPromptBytes) throw new Error("AI_CONTEXT_TOO_LARGE");
  const agent = getNoticeParserAgent();
  const { runId } = context;
  const options = {
    maxSteps: 1,
    abortSignal: AbortSignal.timeout(AGENDA_AI_LIMITS.timeoutMs),
    modelSettings: { maxOutputTokens: AGENDA_AI_LIMITS.outputTokens, maxRetries: 0 },
    ...(runId ? { runId } : {}),
    structuredOutput: { schema: noticeGenerationSchema, errorStrategy: "strict" as const },
  };
  const response = attachment
    ? await agent.generate(
        [
          {
            role: "user",
            content:
              attachment.type === "application/pdf"
                ? [
                    { type: "text", text: content },
                    { type: "file", data: attachment.dataUrl, mediaType: "application/pdf" },
                  ]
                : [
                    { type: "text", text: content },
                    { type: "image", image: attachment.dataUrl },
                  ],
          },
        ],
        options,
      )
    : await agent.generate(content, options);
  return {
    extraction: validateNoticeExtraction(response.object, input.publishedAt),
    usage: response.usage,
  };
}
