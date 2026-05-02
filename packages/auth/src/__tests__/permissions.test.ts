import { describe, expect, it } from "vitest";
import { isRole, PERMISSIONS, ROLES, roleHasPermission, roleSatisfies } from "../permissions";

describe("ROLES", () => {
  it("exposes the four expected roles", () => {
    expect(ROLES).toEqual(["owner", "admin", "member", "guest"]);
  });
});

describe("isRole", () => {
  it("accepts any of the canonical roles", () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("rejects unknown strings and non-string values", () => {
    expect(isRole("root")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe("PERMISSIONS matrix", () => {
  it("every permission lists at least one role", () => {
    for (const [permission, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `permission ${permission} must grant some role`).toBeGreaterThan(0);
    }
  });

  it("every role in the matrix is a canonical role", () => {
    for (const roles of Object.values(PERMISSIONS)) {
      for (const role of roles) {
        expect(isRole(role)).toBe(true);
      }
    }
  });

  it("billing.manage is restricted to owner only", () => {
    expect(PERMISSIONS["billing.manage"]).toEqual(["owner"]);
  });
});

describe("roleHasPermission", () => {
  it("returns true when role has permission", () => {
    expect(roleHasPermission("owner", "billing.manage")).toBe(true);
    expect(roleHasPermission("admin", "users.list")).toBe(true);
    expect(roleHasPermission("member", "content.create")).toBe(true);
  });

  it("returns false when role lacks permission", () => {
    expect(roleHasPermission("member", "billing.manage")).toBe(false);
    expect(roleHasPermission("guest", "users.list")).toBe(false);
    expect(roleHasPermission("admin", "billing.manage")).toBe(false);
  });
});

describe("roleSatisfies", () => {
  it("treats owner as satisfying admin/member requirements", () => {
    expect(roleSatisfies("owner", "admin")).toBe(true);
    expect(roleSatisfies("owner", "member")).toBe(true);
  });

  it("does not let lower-privilege roles satisfy higher requirements", () => {
    expect(roleSatisfies("admin", "owner")).toBe(false);
    expect(roleSatisfies("member", "admin")).toBe(false);
  });
});
