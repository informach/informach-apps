import assert from "node:assert/strict";
import { test } from "node:test";
import { degrees, PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { widgetControlGeometry } from "../src/shared/widget-geometry.ts";

test("interactive field geometry follows real PDF viewport and MK rotation across crop origins and extra page turns", async () => {
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([500, 700]);
    page.setCropBox(35, 70, 420, 580);
    page.setRotation(degrees(rotation));
    for (const ownRotation of [0, 90, 180, 270]) {
      const field = pdf.getForm().createTextField(`field_${rotation}_${ownRotation}`);
      field.setText("ORIENTATION");
      field.addToPage(page, {
        x: 80,
        y: 140 + ownRotation,
        width: 180,
        height: 24,
        rotate: degrees(ownRotation),
      });
    }
  }
  const task = getDocument({ data: await pdf.save(), useSystemFonts: true });
  const reader = await task.promise;
  try {
    for (let index = 1; index <= 4; index++) {
      const page = await reader.getPage(index);
      const fields = await page.getAnnotations();
      for (const turn of [0, 90, 180, 270]) {
        const viewport = page.getViewport({ scale: 1.25, rotation: (page.rotate + turn) % 360 });
        for (const field of fields) {
          const [x1, y1] = viewport.convertToViewportPoint(field.rect[0], field.rect[1]),
            [x2, y2] = viewport.convertToViewportPoint(field.rect[2], field.rect[3]),
            box = {
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              w: Math.abs(x2 - x1),
              h: Math.abs(y2 - y1),
            },
            control = widgetControlGeometry(box, viewport.rotation, field.rotation),
            radians = (control.rotation * Math.PI) / 180,
            cx = control.box.x + control.box.w / 2,
            cy = control.box.y + control.box.h / 2;
          const corners = [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ].map(([sx, sy]) => {
            const x = (sx * control.box.w) / 2,
              y = (sy * control.box.h) / 2;
            return [
              cx + Math.cos(radians) * x - Math.sin(radians) * y,
              cy + Math.sin(radians) * x + Math.cos(radians) * y,
            ];
          });
          assert.ok(Math.abs(Math.min(...corners.map(([x]) => x)) - box.x) < 1e-8);
          assert.ok(Math.abs(Math.max(...corners.map(([, y]) => y)) - (box.y + box.h)) < 1e-8);
          // Independent PDF-space baseline: MK/R turns counterclockwise, then the viewport flips Y.
          const mk = (field.rotation * Math.PI) / 180,
            start = viewport.convertToViewportPoint(100, 200),
            end = viewport.convertToViewportPoint(100 + Math.cos(mk), 200 + Math.sin(mk));
          assert.ok(Math.abs((end[0] - start[0]) / 1.25 - Math.cos(radians)) < 1e-8);
          assert.ok(Math.abs((end[1] - start[1]) / 1.25 - Math.sin(radians)) < 1e-8);
          assert.ok(control.box.w > 0 && control.box.h > 0);
        }
      }
    }
  } finally {
    await task.destroy();
  }
});
