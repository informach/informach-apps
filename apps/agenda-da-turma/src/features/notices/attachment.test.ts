import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prepareNoticeAttachment } from "./attachment";

async function pdfInput() {
  const pdf = await PDFDocument.create();
  for (let i = 1; i <= 4; i++) pdf.addPage([i * 100, 300]);
  return {
    name: "sintetico.pdf",
    dataUrl: `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString("base64")}`,
  };
}
describe("school attachments", () => {
  it("requires a page selection for a long PDF", async () => {
    await expect(prepareNoticeAttachment(await pdfInput())).rejects.toThrow("SELECT_PDF_PAGES");
  });
  it("sends only selected pages while retaining the original for review", async () => {
    const input = await pdfInput();
    const prepared = await prepareNoticeAttachment({ ...input, pages: [2, 4] });
    expect(prepared?.pages).toEqual([2, 4]);
    expect(prepared?.originalData).toBe(input.dataUrl.split(",")[1]);
    const output = await PDFDocument.load(
      Buffer.from(prepared?.dataUrl.split(",")[1] ?? "", "base64"),
    );
    expect(output.getPages().map((p) => p.getWidth())).toEqual([200, 400]);
  });
  it.each([[1, 1], [0], [5], [1, 2, 3, 4]])(
    "rejects invalid selected pages %j",
    async (...pages) => {
      await expect(prepareNoticeAttachment({ ...(await pdfInput()), pages })).rejects.toThrow(
        "SELECT_PDF_PAGES",
      );
    },
  );
  it("does not accept a renamed text file as an image", async () => {
    await expect(
      prepareNoticeAttachment({
        name: "recado.png",
        dataUrl: `data:image/png;base64,${Buffer.from("not an image").toString("base64")}`,
      }),
    ).rejects.toThrow("INVALID_ATTACHMENT");
  });
});
