import { afterEach, expect, it, vi } from "vitest";
import { installFocusNav } from "./focus-nav";

afterEach(() => vi.unstubAllGlobals());

it("ignores a keyless event while retaining the TV back key code", () => {
  const window = new EventTarget();
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", { querySelector: () => null });
  vi.stubGlobal("HTMLInputElement", class {});
  const back = vi.fn();
  const uninstall = installFocusNav(back);
  try {
    expect(() => window.dispatchEvent(new Event("keydown"))).not.toThrow();
    expect(back).not.toHaveBeenCalled();
    const tvBack = new Event("keydown", { cancelable: true });
    Object.defineProperty(tvBack, "keyCode", { value: 461 });
    window.dispatchEvent(tvBack);
    expect(back).toHaveBeenCalledOnce();
    expect(tvBack.defaultPrevented).toBe(true);
    const escapeEvent = new Event("keydown", { cancelable: true });
    Object.defineProperty(escapeEvent, "key", { value: "Escape" });
    window.dispatchEvent(escapeEvent);
    expect(back).toHaveBeenCalledTimes(2);
    expect(escapeEvent.defaultPrevented).toBe(true);
  } finally {
    uninstall();
  }
});
