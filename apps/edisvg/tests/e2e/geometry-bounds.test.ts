import assert from "node:assert/strict";
import { test } from "node:test";
import { geometryBounds, geometryPath } from "@informach/edi-motion/geometry";
import { parseSvgPath } from "@informach/edi-motion/svg-path";
import { chromium } from "playwright";
import { rendererServer } from "../rendererServer";

test("pure cubic bounds agree with actual SVG geometry and expose its disconnected move-only discrepancy", {
  timeout: 30000,
}, async () => {
  const sources = [
    "M0 0C0 100 100 100 100 0",
    "M0 0C100 0 -100 0 0 0",
    "M0 0C1 1 2 2 3 3",
    "M0 0C1 1 0 0 1 1",
    "M0 0C1 1 2.000000000001 -1 3 0",
    "M3 2L3 50",
    "M7 9",
    "M0 0L10 0L10 10Z M-20 -30",
    "M0 0C0 0 10 0 10 0C10 40 0 40 0 0Z",
  ];
  for (let index = 0; index < 96; index++) {
    const coordinates = Array.from(
      { length: 8 },
      (_, offset) => Math.sin((index + 1) * (offset + 3) * 1.37) * 500,
    );
    sources.push(
      `M${coordinates.slice(0, 2).join(" ")}C${coordinates.slice(2).join(" ")}${index % 2 ? "Z" : ""}`,
    );
  }
  const cases = sources.map((source) => {
      const geometry = parseSvgPath(source);
      return {
        path: geometryPath(geometry),
        expected: geometryBounds(geometry, { remaining: 2_000_000 }),
        coordinateRange:
          2 *
          Math.max(
            1,
            ...geometry.flatMap((contour) =>
              contour.points.flatMap((point) =>
                [point, point.in, point.out].flatMap((value) =>
                  value ? [Math.abs(value.x), Math.abs(value.y)] : [],
                ),
              ),
            ),
          ),
      };
    }),
    server = await rendererServer(
      new Map([["/bounds.html", { content: "<main></main>", mime: "text/html" }]]),
    ),
    channel = process.env.EDISVG_TEST_BROWSER_CHANNEL,
    browser = await chromium.launch(channel ? { channel } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/bounds.html`);
    const actual = await page.evaluate((cases) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      document.body.append(svg);
      return cases.map(({ path }) => {
        const element = document.createElementNS(svg.namespaceURI, "path");
        if (!(element instanceof SVGPathElement)) throw new Error("Missing real SVG path");
        element.setAttribute("d", path);
        svg.append(element);
        const { x, y, width, height } = element.getBBox();
        element.remove();
        return { x, y, width, height };
      });
    }, cases);
    for (const [index, entry] of cases.entries()) {
      const measured = actual[index];
      assert.ok(entry.expected && measured);
      if (index === 7) {
        // SVG 2 includes disconnected degenerate subpaths. This Chromium
        // profile ignores a trailing move-only contour beside drawn edges.
        // Keep the discrepancy visible; relative paint must refuse it.
        assert.deepEqual(entry.expected, { x: -20, y: -30, width: 30, height: 40 });
        assert.deepEqual(measured, { x: 0, y: 0, width: 10, height: 10 });
        continue;
      }
      // The diagnostic corpus measured up to 3.04 float32 units at its full
      // coordinate range. Bound this comparison to four such units; double
      // precision is checked independently by analytic/Bernstein core tests.
      // This does not change the independent pixel comparison's tolerance.
      for (const key of ["x", "y", "width", "height"] as const)
        assert.ok(
          Math.abs(entry.expected[key] - measured[key]) <= 4 * entry.coordinateRange * 2 ** -23,
          `${index} ${key}: ${entry.expected[key]} != ${measured[key]}`,
        );
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
