import { describe, expect, it } from "vitest";
import {
  formatDeviceUserCode,
  isCompleteDeviceUserCode,
  normalizeDeviceUserCode,
} from "./device-code";

describe("device user codes", () => {
  it("accepts the code however it was typed", () => {
    for (const typed of ["wdjb mjht", "WDJB-MJHT", " wdjbMJHT ", "WD JB MJ HT"])
      expect(normalizeDeviceUserCode(typed)).toBe("WDJBMJHT");
  });
  it("only treats eight characters as a complete code", () => {
    expect(isCompleteDeviceUserCode("WDJB MJH")).toBe(false);
    expect(isCompleteDeviceUserCode("WDJB-MJHT")).toBe(true);
    expect(isCompleteDeviceUserCode("WDJB MJHTX")).toBe(false);
  });
  it("shows complete codes in two groups and leaves partial input untouched", () => {
    expect(formatDeviceUserCode("wdjbmjht")).toBe("WDJB MJHT");
    expect(formatDeviceUserCode("wdj")).toBe("WDJ");
  });
});
