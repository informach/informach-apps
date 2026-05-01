import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHelpers,
  ForbiddenError,
  NotImplementedError,
  OrganizationsDisabledError,
  UnauthorizedError,
} from "../helpers";
import type { Role } from "../permissions";

type TestUser = { id: string; email: string; role?: Role };
type TestSession = { id: string; expiresAt: Date };

function makeAuth(getSessionImpl: ReturnType<typeof vi.fn>) {
  return { api: { getSession: getSessionImpl } };
}

function makeOrgAuth(opts: {
  user?: TestUser | null;
  getActiveMember?: ReturnType<typeof vi.fn>;
  getFullOrganization?: ReturnType<typeof vi.fn>;
  listOrganizations?: ReturnType<typeof vi.fn>;
}) {
  const session = opts.user
    ? { user: opts.user, session: { id: "s1", expiresAt: new Date() } }
    : null;
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(session),
      getActiveMember: opts.getActiveMember,
      getFullOrganization: opts.getFullOrganization,
      listOrganizations: opts.listOrganizations,
    },
  };
}

describe("buildHelpers.getSession", () => {
  let getSessionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSessionMock = vi.fn();
  });

  it("forwards the headers object to auth.api.getSession", async () => {
    getSessionMock.mockResolvedValue(null);
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    const headers = new Headers({ cookie: "session=abc" });
    await helpers.getSession(headers);

    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).toHaveBeenCalledWith({ headers });
  });

  it("returns the session when auth returns one", async () => {
    const session = {
      user: { id: "u1", email: "u@example.com" } satisfies TestUser,
      session: { id: "s1", expiresAt: new Date() } satisfies TestSession,
    };
    getSessionMock.mockResolvedValue(session);

    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));
    await expect(helpers.getSession(new Headers())).resolves.toEqual(session);
  });

  it("normalizes undefined to null", async () => {
    getSessionMock.mockResolvedValue(undefined);
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    await expect(helpers.getSession(new Headers())).resolves.toBeNull();
  });
});

describe("buildHelpers.getCurrentUser", () => {
  it("returns the user when a session exists", async () => {
    const user: TestUser = { id: "u1", email: "u@example.com" };
    const getSessionMock = vi.fn().mockResolvedValue({
      user,
      session: { id: "s1", expiresAt: new Date() },
    });
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    await expect(helpers.getCurrentUser(new Headers())).resolves.toEqual(user);
  });

  it("returns null when no session", async () => {
    const getSessionMock = vi.fn().mockResolvedValue(null);
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    await expect(helpers.getCurrentUser(new Headers())).resolves.toBeNull();
  });
});

describe("buildHelpers.requireUser", () => {
  it("returns the user when authenticated", async () => {
    const user: TestUser = { id: "u1", email: "u@example.com" };
    const getSessionMock = vi.fn().mockResolvedValue({
      user,
      session: { id: "s1", expiresAt: new Date() },
    });
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    await expect(helpers.requireUser(new Headers())).resolves.toEqual(user);
  });

  it("throws UnauthorizedError when there is no session", async () => {
    const getSessionMock = vi.fn().mockResolvedValue(null);
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));

    await expect(helpers.requireUser(new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("buildHelpers.hasRole", () => {
  function makeHelpers(user: TestUser | null) {
    const getSessionMock = vi
      .fn()
      .mockResolvedValue(user ? { user, session: { id: "s1", expiresAt: new Date() } } : null);
    return buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));
  }

  it("returns true when the user role matches", () => {
    const helpers = makeHelpers({ id: "u1", email: "u@x", role: "admin" });
    expect(helpers.hasRole({ id: "u1", email: "u@x", role: "admin" }, "admin")).toBe(true);
  });

  it("returns false when the user role differs", () => {
    const helpers = makeHelpers({ id: "u1", email: "u@x", role: "member" });
    expect(helpers.hasRole({ id: "u1", email: "u@x", role: "member" }, "admin")).toBe(false);
  });

  it("returns false when the user has no role attribute", () => {
    const helpers = makeHelpers({ id: "u1", email: "u@x" });
    expect(helpers.hasRole({ id: "u1", email: "u@x" }, "admin")).toBe(false);
  });
});

describe("buildHelpers.assertPermission", () => {
  const helpers = buildHelpers<TestUser, TestSession>(makeAuth(vi.fn().mockResolvedValue(null)));

  it("does not throw when the role grants the permission", () => {
    expect(() =>
      helpers.assertPermission({ id: "u1", email: "u@x", role: "admin" }, "users.list"),
    ).not.toThrow();
  });

  it("throws ForbiddenError when role lacks permission", () => {
    expect(() =>
      helpers.assertPermission({ id: "u1", email: "u@x", role: "member" }, "billing.manage"),
    ).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when user has no role", () => {
    expect(() => helpers.assertPermission({ id: "u1", email: "u@x" }, "users.list")).toThrow(
      ForbiddenError,
    );
  });
});

describe("buildHelpers.requireRole / requireAdmin", () => {
  function helpersWithUser(user: TestUser | null) {
    const getSessionMock = vi
      .fn()
      .mockResolvedValue(user ? { user, session: { id: "s1", expiresAt: new Date() } } : null);
    return buildHelpers<TestUser, TestSession>(makeAuth(getSessionMock));
  }

  it("requireRole returns the user when role matches", async () => {
    const user: TestUser = { id: "u1", email: "u@x", role: "admin" };
    await expect(helpersWithUser(user).requireRole(new Headers(), "admin")).resolves.toEqual(user);
  });

  it("requireRole throws ForbiddenError when role differs", async () => {
    const user: TestUser = { id: "u1", email: "u@x", role: "member" };
    await expect(helpersWithUser(user).requireRole(new Headers(), "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requireRole throws UnauthorizedError when there is no session", async () => {
    await expect(helpersWithUser(null).requireRole(new Headers(), "admin")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('requireAdmin is a shorthand for requireRole("admin")', async () => {
    const user: TestUser = { id: "u1", email: "u@x", role: "admin" };
    await expect(helpersWithUser(user).requireAdmin(new Headers())).resolves.toEqual(user);
  });
});

describe("buildHelpers.hasAccessToProduct (still pending)", () => {
  it("throws NotImplementedError", async () => {
    const helpers = buildHelpers<TestUser, TestSession>(makeAuth(vi.fn().mockResolvedValue(null)));
    await expect(helpers.hasAccessToProduct("u1", "prod_x")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});

describe("buildHelpers — organization helpers", () => {
  it("getActiveMember returns the member when API is available", async () => {
    const member = { id: "m1", userId: "u1", organizationId: "org1", role: "admin" };
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({ getActiveMember: vi.fn().mockResolvedValue(member) }),
    );
    await expect(helpers.getActiveMember(new Headers())).resolves.toEqual(member);
  });

  it("getActiveMember throws OrganizationsDisabledError when API is missing", async () => {
    const helpers = buildHelpers<TestUser, TestSession>(makeOrgAuth({}));
    await expect(helpers.getActiveMember(new Headers())).rejects.toBeInstanceOf(
      OrganizationsDisabledError,
    );
  });

  it("listUserOrganizations returns the array when API is available", async () => {
    const orgs = [{ id: "org1" }, { id: "org2" }];
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({ listOrganizations: vi.fn().mockResolvedValue(orgs) }),
    );
    await expect(helpers.listUserOrganizations(new Headers())).resolves.toEqual(orgs);
  });

  it("listUserOrganizations throws when API is missing", async () => {
    const helpers = buildHelpers<TestUser, TestSession>(makeOrgAuth({}));
    await expect(helpers.listUserOrganizations(new Headers())).rejects.toBeInstanceOf(
      OrganizationsDisabledError,
    );
  });

  it("getActiveOrganization returns the org when API is available", async () => {
    const org = { id: "org1", name: "Acme" };
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({ getFullOrganization: vi.fn().mockResolvedValue(org) }),
    );
    await expect(helpers.getActiveOrganization(new Headers())).resolves.toEqual(org);
  });

  it("requireOrgMember returns user + member + organization", async () => {
    const user: TestUser = { id: "u1", email: "u@x" };
    const member = { id: "m1", userId: "u1", organizationId: "org1", role: "admin" };
    const org = { id: "org1", name: "Acme" };
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({
        user,
        getActiveMember: vi.fn().mockResolvedValue(member),
        getFullOrganization: vi.fn().mockResolvedValue(org),
      }),
    );
    await expect(helpers.requireOrgMember(new Headers())).resolves.toEqual({
      user,
      member,
      organization: org,
    });
  });

  it("requireOrgMember throws ForbiddenError when user has no active membership", async () => {
    const user: TestUser = { id: "u1", email: "u@x" };
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({ user, getActiveMember: vi.fn().mockResolvedValue(null) }),
    );
    await expect(helpers.requireOrgMember(new Headers())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireOrgMember throws ForbiddenError when org role does not match", async () => {
    const user: TestUser = { id: "u1", email: "u@x" };
    const member = { id: "m1", userId: "u1", organizationId: "org1", role: "member" };
    const helpers = buildHelpers<TestUser, TestSession>(
      makeOrgAuth({ user, getActiveMember: vi.fn().mockResolvedValue(member) }),
    );
    await expect(helpers.requireOrgMember(new Headers(), "owner")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requireOrgMember throws UnauthorizedError when there is no session", async () => {
    const helpers = buildHelpers<TestUser, TestSession>(makeOrgAuth({}));
    await expect(helpers.requireOrgMember(new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
