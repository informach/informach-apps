import { describe, expect, it } from "vitest";
import {
  AUTH_PROTECTED_PATHS,
  AUTH_PUBLIC_PATHS,
  AUTH_SIGN_IN_PATH,
  AUTH_SIGN_UP_PATH,
} from "./auth-routing";

describe("auth routing", () => {
  it("uses the app auth page paths instead of package defaults", () => {
    expect(AUTH_SIGN_IN_PATH).toBe("/login");
    expect(AUTH_SIGN_UP_PATH).toBe("/signup");
    expect(AUTH_PUBLIC_PATHS).toContain("/login");
    expect(AUTH_PUBLIC_PATHS).toContain("/signup");
    expect(AUTH_PUBLIC_PATHS).not.toContain("/sign-in");
    expect(AUTH_PUBLIC_PATHS).not.toContain("/sign-up");
  });

  it("protects dashboard pages", () => {
    expect(AUTH_PROTECTED_PATHS).toContain("/dashboard");
  });
});
