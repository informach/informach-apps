import { describe, expect, it } from "vitest";
import { imagePresentation } from "./imagePresentation";

const asset = { id: `asset-${"0".repeat(64)}`, width: 30, height: 30 },
  insets = { top: 5, right: 5, bottom: 5, left: 5 };
describe("image presentation", () => {
  it("preserves corners, stretches the center and shrinks borders proportionally below minimum size", () => {
    const large = imagePresentation(asset, { width: "100", height: "60" }, insets);
    expect(large.children).toHaveLength(9);
    expect(large.children[0]?.attrs).toMatchObject({ width: "5", height: "5", viewBox: "0 0 5 5" });
    expect(large.children[4]?.attrs).toMatchObject({
      x: "5",
      y: "5",
      width: "90",
      height: "50",
      viewBox: "5 5 20 20",
    });
    expect(large.children[8]?.attrs).toMatchObject({ x: "95", y: "55", width: "5", height: "5" });
    const small = imagePresentation(asset, { width: "6", height: "4" }, insets);
    expect(small.children[0]?.attrs).toMatchObject({ width: "3", height: "2" });
    expect(small.children[4]?.attrs).toMatchObject({ width: "0", height: "0" });
    const zero = imagePresentation(
      asset,
      { width: "0", height: "0" },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    expect(
      zero.children.every((cell) => cell.attrs.width === "0" && cell.attrs.height === "0"),
    ).toBe(true);
    expect(JSON.stringify(zero)).not.toMatch(/NaN|Infinity/);
  });
  it("refuses degenerate source centers, relative dimensions and out-of-budget sizes before producing geometry", () => {
    expect(() => imagePresentation(asset, {}, { ...insets, left: 25 })).toThrow(/centro/);
    expect(() => imagePresentation(asset, { width: "100%" }, insets)).toThrow(/absolutas/);
    expect(() => imagePresentation(asset, { height: "100001" }, insets)).toThrow(/orçamento/);
    expect(imagePresentation(asset, { width: "100%" }).children).toHaveLength(1);
    expect(() => imagePresentation(asset, { onload: "alert(1)" })).toThrow(/Imagem não aceita/);
    expect(() => imagePresentation(asset, { transform: "url(https://unsafe.test)" })).toThrow(
      /inseguro/,
    );
    expect(() => imagePresentation({ ...asset, id: "untrusted-url" }, {})).toThrow();
    expect(imagePresentation(asset, { width: "1e-7" }, insets).attrs.width).toBe("1e-7");
  });
});
