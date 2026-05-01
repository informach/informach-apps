import { describe, expect, it } from "vitest";
import { classifySendgridError, MAX_ATTEMPTS, nextAttemptDelaySeconds } from "../retry";

describe("nextAttemptDelaySeconds", () => {
  it("matches the polynomial formula attempt^4 + 2 without jitter", () => {
    const noJitter = () => 0.5;
    expect(nextAttemptDelaySeconds(1, noJitter)).toBe(3);
    expect(nextAttemptDelaySeconds(2, noJitter)).toBe(18);
    expect(nextAttemptDelaySeconds(3, noJitter)).toBe(83);
    expect(nextAttemptDelaySeconds(4, noJitter)).toBe(258);
  });

  it("never returns a value below 1 even with worst-case jitter", () => {
    const worstCaseRng = () => 0;
    expect(nextAttemptDelaySeconds(1, worstCaseRng)).toBeGreaterThanOrEqual(1);
  });

  it("applies jitter within ±15%", () => {
    const baseAttempt = 4;
    const baseValue = baseAttempt ** 4 + 2;
    const minExpected = Math.floor(baseValue * 0.85);
    const maxExpected = Math.floor(baseValue * 1.15);
    for (let i = 0; i < 50; i++) {
      const v = nextAttemptDelaySeconds(baseAttempt);
      expect(v).toBeGreaterThanOrEqual(minExpected);
      expect(v).toBeLessThanOrEqual(maxExpected + 1);
    }
  });

  it("throws on attempts < 1", () => {
    expect(() => nextAttemptDelaySeconds(0)).toThrow();
  });

  it("exposes MAX_ATTEMPTS aligned with Akita's 8-attempt pattern", () => {
    expect(MAX_ATTEMPTS).toBe(8);
  });
});

describe("classifySendgridError", () => {
  it("classifies 400 as permanent (rejected message)", () => {
    expect(classifySendgridError({ response: { statusCode: 400 } })).toBe("permanent");
  });
  it("classifies 401 as permanent (auth failure)", () => {
    expect(classifySendgridError({ response: { statusCode: 401 } })).toBe("permanent");
  });
  it("classifies 403 as permanent (forbidden / sender unverified)", () => {
    expect(classifySendgridError({ response: { statusCode: 403 } })).toBe("permanent");
  });
  it("classifies 413 as permanent (payload too large)", () => {
    expect(classifySendgridError({ response: { statusCode: 413 } })).toBe("permanent");
  });
  it("classifies 429 as transient (rate limited)", () => {
    expect(classifySendgridError({ response: { statusCode: 429 } })).toBe("transient");
  });
  it("classifies 5xx as transient", () => {
    expect(classifySendgridError({ response: { statusCode: 500 } })).toBe("transient");
    expect(classifySendgridError({ response: { statusCode: 503 } })).toBe("transient");
  });
  it("classifies 408/425 as transient", () => {
    expect(classifySendgridError({ response: { statusCode: 408 } })).toBe("transient");
    expect(classifySendgridError({ response: { statusCode: 425 } })).toBe("transient");
  });
  it("defaults to transient when no statusCode is available (network error)", () => {
    expect(classifySendgridError({ message: "ECONNRESET" })).toBe("transient");
    expect(classifySendgridError({})).toBe("transient");
  });
  it("uses error.code as a fallback for statusCode", () => {
    expect(classifySendgridError({ code: 401 })).toBe("permanent");
  });
});
