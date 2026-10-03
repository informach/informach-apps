import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parsePlane, planeTool, planeValue } from "./plane";
import { PlaneTool } from "./plane-component";

const circle = {
  family: "L18" as const,
  mode: "circulos-medidas-e-angulos",
  grade: 9,
  variant: 0 as const,
};
const polygon = { ...circle, mode: "poligonos-angulos" };
const state = parsePlane(circle, planeTool.activity(circle).initialState);
describe("circle and convex polygon geometry", () => {
  it("distinguishes linear circumference from square area scaling", () => {
    expect(planeValue(circle, { ...state, radius: 2 })).toBeCloseTo(4 * Math.PI, 12);
    expect(planeValue(circle, { ...state, radius: 2, circleMetric: "area" })).toBeCloseTo(
      4 * Math.PI,
      12,
    );
    expect(planeValue(circle, { ...state, radius: 4, circleMetric: "area" })).toBeCloseTo(
      16 * Math.PI,
      12,
    );
    expect(planeValue(circle, { ...state, radius: 4 })).toBeCloseTo(8 * Math.PI, 12);
  });
  it("uses the intercepted arc, including major arcs, for inscribed angles", () => {
    expect(planeValue(circle, { ...state, angle: 270, circleMetric: "inscribed" })).toBe(135);
    expect(planeValue(circle, { ...state, radius: 4, angle: 90, circleMetric: "arc" })).toBeCloseTo(
      2 * Math.PI,
      12,
    );
    expect(
      planeValue(circle, { ...state, radius: 4, angle: 90, circleMetric: "sector" }),
    ).toBeCloseTo(4 * Math.PI, 12);
  });
  it("handles polygon sums, regular internal/external and unknown triangle angles", () => {
    expect(planeValue(polygon, { ...state, sides: 5, polygonMetric: "sum" })).toBe(540);
    expect(planeValue(polygon, { ...state, sides: 5, polygonMetric: "regular" })).toBe(108);
    expect(planeValue(polygon, { ...state, sides: 8, polygonMetric: "exterior" })).toBe(45);
    expect(
      planeValue(polygon, { ...state, firstAngle: 105, secondAngle: 25, polygonMetric: "missing" }),
    ).toBe(50);
    expect(() => parsePlane(polygon, { ...state, firstAngle: 150, secondAngle: 30 })).toThrow();
  });
  it("accepts fraction, comma decimal and implicit units within the declared tolerance", () => {
    const angleState = { ...state, angle: 90, circleMetric: "inscribed" as const };
    for (const answer of ["45", "90/2", "45,000"])
      expect(planeTool.assess(circle, angleState, answer).correct).toBe(true);
    expect(planeTool.assess(circle, angleState, "44,99").correct).toBe(false);
    expect(planeTool.assess(circle, { ...state, radius: 2 }, "12,566").correct).toBe(true);
  });
  it("renders labels and drawings for both variants with disabled controls", () => {
    for (const mode of planeTool.modes)
      for (const variant of [0, 1] as const) {
        const launch = { ...circle, mode, variant };
        const activity = planeTool.activity(launch);
        expect(() => parsePlane(launch, activity.initialState)).not.toThrow();
        const html = renderToStaticMarkup(
          createElement(PlaneTool, {
            launch,
            state: activity.initialState,
            disabled: true,
            onChange: () => {},
          }),
        );
        expect(html).toContain('role="img"');
        expect(html).toContain("disabled");
        expect(html).toContain("Medida a descobrir");
      }
  });
});
