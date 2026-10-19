import { z } from "zod";

/**
 * A simple guide (phase 7): ordered steps, each with a sanitized image (the capture's final
 * render, with its masks and crop, never the original), a title, a description and the
 * alternative text. Stored flat in the library folder as `<id>.guide` (JSON) and
 * `<id>.<assetId>.png`, so whole-library backups carry it. Two limited layouts; no templates.
 */
export const GUIDE_EXTENSION = "guide";
export const MAX_GUIDE_STEPS = 200;
export const MAX_STEP_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_GUIDE_IMAGE_BYTES = 400 * 1024 * 1024;
export const guideLayouts = ["tutorial", "comparison"] as const;

export const guideStepSchema = z.strictObject({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  title: z.string().max(200).default(""),
  description: z.string().max(4000).default(""),
  alt: z.string().max(500).default(""),
  width: z.number().int().positive().max(30000),
  height: z.number().int().positive().max(30000),
  /** The library capture the image came from, for reference only; the guide never reads it. */
  sourceId: z.string().uuid().optional(),
});
export type GuideStep = z.infer<typeof guideStepSchema>;
export const guideSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(4000).default(""),
  layout: z.enum(guideLayouts).default("tutorial"),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().default(null),
  steps: z
    .array(guideStepSchema)
    .max(MAX_GUIDE_STEPS)
    .refine(
      (steps) => new Set(steps.map((step) => step.id)).size === steps.length,
      "Passo repetido no guia.",
    ),
});
export type Guide = z.infer<typeof guideSchema>;
/** What the editor sends: the store sets identity, dates and checks the images. */
export const guideSaveSchema = z.strictObject({
  id: z.string().uuid().optional(),
  title: guideSchema.shape.title,
  description: guideSchema.shape.description,
  layout: guideSchema.shape.layout,
  steps: guideSchema.shape.steps,
});
export interface GuideSummary {
  id: string;
  title: string;
  steps: number;
  updated: string;
  deletedAt: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const paragraphs = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br>")}</p>`)
    .join("");

/**
 * The guide as one self-contained HTML file: images embedded, no script, no remote resource
 * (its own CSP says so), text escaped. Print styles keep a step on one page when it fits; the
 * PDF is this same page printed by Chromium.
 */
export function renderGuideHtml(guide: Guide, images: ReadonlyMap<string, string>): string {
  const steps = guide.steps
    .map((step, index) => {
      const image = images.get(step.assetId);
      if (!image) throw new Error("Imagem de passo ausente.");
      const heading = step.title.trim() || `Passo ${index + 1}`;
      return `<li class="step"><h2><span class="number">${index + 1}</span> ${escapeHtml(heading)}</h2><img src="data:image/png;base64,${image}" width="${step.width}" height="${step.height}" alt="${escapeHtml(step.alt.trim() || heading)}">${paragraphs(step.description)}</li>`;
    })
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(guide.title)}</title><style>
body{font-family:"Segoe UI",Arial,sans-serif;color:#172030;margin:0 auto;max-width:960px;padding:32px 24px;line-height:1.5}
h1{font-size:28px;margin:0 0 8px}h2{font-size:19px;margin:0 0 12px;display:flex;gap:10px;align-items:center}
.number{display:inline-grid;place-items:center;min-width:30px;height:30px;border-radius:50%;background:#0062ff;color:#fff;font-size:15px}
ol{list-style:none;padding:0;margin:24px 0 0}.step{margin:0 0 32px;break-inside:avoid;page-break-inside:avoid}
img{display:block;max-width:100%;height:auto;border:1px solid #d5dbe5;border-radius:6px}
.comparison ol{display:grid;grid-template-columns:1fr 1fr;gap:24px}.comparison .step{margin:0}
@media print{body{padding:0;max-width:none}.comparison ol{gap:16px}}
</style></head><body class="${guide.layout}"><h1>${escapeHtml(guide.title)}</h1>${paragraphs(guide.description)}<ol>${steps}</ol></body></html>`;
}
