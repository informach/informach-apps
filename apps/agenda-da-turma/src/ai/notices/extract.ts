import "server-only";
import type { prepareNoticeAttachment } from "@/features/notices/attachment";
import { validateNoticeExtraction } from "@/features/notices/extraction";
import { noticeGenerationSchema } from "@/features/notices/schemas";
import { getNoticeParserAgent } from "./agent";

// The production flow and the opt-in evaluation use this same extraction boundary.
export async function generateNoticeExtraction(
  input: { text: string; source: string; publishedAt: string | null },
  attachment: Awaited<ReturnType<typeof prepareNoticeAttachment>>,
  runId?: string,
) {
  const content = `Data da publicação/anotação fornecida pela família: ${input.publishedAt ?? "desconhecida"}. Origem: ${input.source}. Páginas originais selecionadas: ${attachment?.pages.join(", ") || "não se aplica"}.\nRECADO:\n${input.text}`;
  const agent = getNoticeParserAgent();
  const options = {
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
