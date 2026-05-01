import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const headersMock = vi.fn();
const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

import { UnauthorizedError } from "../helpers";
import { createServerHelpers } from "../server";

type TestUser = { id: string; role?: string };
type TestSession = { id: string };

function makeHelpers(currentUser: TestUser | null) {
  return {
    getSession: vi.fn(async () =>
      currentUser ? { user: currentUser, session: { id: "s1" } as TestSession } : null,
    ),
    getCurrentUser: vi.fn(async () => currentUser),
    requireUser: vi.fn(async () => {
      if (!currentUser) throw new UnauthorizedError();
      return currentUser;
    }),
    requireRole: vi.fn(),
    requireAdmin: vi.fn(),
    hasRole: vi.fn(),
    assertRole: vi.fn(),
    assertPermission: vi.fn(),
    hasAccessToProduct: vi.fn(),
    getActiveOrganization: vi.fn(),
    getActiveMember: vi.fn(),
    listUserOrganizations: vi.fn(),
    requireOrgMember: vi.fn(),
  };
}

describe("createServerHelpers.getServerSession / getCurrentUserServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ cookie: "session=abc" }));
  });

  it("forwards Next request headers to helpers.getSession", async () => {
    const helpers = makeHelpers({ id: "u1" });
    const server = createServerHelpers(helpers);
    await server.getServerSession();
    expect(helpers.getSession).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no session", async () => {
    const helpers = makeHelpers(null);
    const server = createServerHelpers(helpers);
    expect(await server.getCurrentUserServer()).toBeNull();
  });
});

describe("createServerHelpers.requireUserServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
  });

  it("returns the user when authenticated", async () => {
    const helpers = makeHelpers({ id: "u1" });
    const server = createServerHelpers(helpers);
    await expect(server.requireUserServer()).resolves.toEqual({ id: "u1" });
  });

  it("propagates UnauthorizedError when there is no session", async () => {
    const helpers = makeHelpers(null);
    const server = createServerHelpers(helpers);
    await expect(server.requireUserServer()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("createServerHelpers.redirectIfUnauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
  });

  it("returns the user when present without redirecting", async () => {
    const helpers = makeHelpers({ id: "u1" });
    const server = createServerHelpers(helpers);
    await expect(server.redirectIfUnauthenticated()).resolves.toEqual({ id: "u1" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in by default when no user", async () => {
    const helpers = makeHelpers(null);
    const server = createServerHelpers(helpers);
    await expect(server.redirectIfUnauthenticated()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("preserves the next path in the query string when given", async () => {
    const helpers = makeHelpers(null);
    const server = createServerHelpers(helpers);
    await expect(server.redirectIfUnauthenticated("/dashboard?x=1")).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard%3Fx%3D1",
    );
  });

  it("respects custom signInPath and nextParam", async () => {
    const helpers = makeHelpers(null);
    const server = createServerHelpers(helpers, { signInPath: "/login", nextParam: "redirect" });
    await expect(server.redirectIfUnauthenticated("/x")).rejects.toThrow(
      "REDIRECT:/login?redirect=%2Fx",
    );
  });
});
