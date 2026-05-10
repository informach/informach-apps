import { describe, expect, it } from "vitest";
import {
  getSubjectColorIndex,
  getSubjectIconClass,
  getSubjectTextClass,
  getSubjectTintedClass,
} from "./utils";

describe("getSubjectColorIndex", () => {
  it("maps Matemática to chart-1 (azul)", () => {
    expect(getSubjectColorIndex("Matemática")).toBe(1);
  });

  it("ignores case and accents", () => {
    expect(getSubjectColorIndex("MATEMATICA")).toBe(1);
    expect(getSubjectColorIndex("matemática")).toBe(1);
  });

  it("maps Português to chart-2 (verde)", () => {
    expect(getSubjectColorIndex("Português")).toBe(2);
    expect(getSubjectColorIndex("Língua Portuguesa")).toBe(2);
  });

  it("maps Ciências to chart-3 (violeta)", () => {
    expect(getSubjectColorIndex("Ciências")).toBe(3);
  });

  it("maps História to chart-4 (laranja)", () => {
    expect(getSubjectColorIndex("História")).toBe(4);
  });

  it("maps Inglês to chart-5 (rosa)", () => {
    expect(getSubjectColorIndex("Inglês")).toBe(5);
    expect(getSubjectColorIndex("Língua Inglesa")).toBe(5);
  });

  it("falls back to deterministic hash for unknown subjects", () => {
    const a = getSubjectColorIndex("Geografia");
    const b = getSubjectColorIndex("Geografia");
    expect(a).toBe(b);
    expect([1, 2, 3, 4, 5]).toContain(a);
  });

  it("returns 1 for empty string", () => {
    expect(getSubjectColorIndex("")).toBe(1);
    expect(getSubjectColorIndex("   ")).toBe(1);
  });
});

describe("class helpers", () => {
  it("returns chart-1 classes for Matemática", () => {
    expect(getSubjectTintedClass("Matemática")).toContain("chart-1");
    expect(getSubjectTextClass("Matemática")).toBe("text-chart-1");
    expect(getSubjectIconClass("Matemática")).toContain("chart-1");
  });
});
