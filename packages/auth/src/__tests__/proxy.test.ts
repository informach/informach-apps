import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => {
  const FakeNextResponse = {
    next: vi.fn(() => ({ kind: "next" })),
    redirect: vi.fn((url: URL) => ({ kind: "redirect", url })),
  };
  return { NextResponse: FakeNextResponse };
});

import { NextResponse } from "next/server";
import { createAuthProxy } from "../proxy";

type TestUser = { id: string; role?: string };

function makeRequest(pathname: string, search = "") {
  const url = new URL(`http://localhost${pathname}${search}`);
  return {
    nextUrl: {
      pathname,
      search,
      clone: () => new URL(url.toString()),
    },
    headers: new Headers(),
  } as unknown as Parameters<ReturnType<typeof createAuthProxy>>[0];
}

function makeHelpers(currentUser: TestUser | null) {
  return {
    getCurrentUser: vi.fn(async () => currentUser),
  };
}

describe("createAuthProxy", () => {
  const mockedRedirect = vi.mocked(NextResponse.redirect);
  const mockedNext = vi.mocked(NextResponse.next);

  beforeEach(() => vi.clearAllMocks());

  it("passes through paths that do not require auth", async () => {
    const proxy = createAuthProxy(makeHelpers(null), { requireAuth: ["/dashboard"] });
    await proxy(makeRequest("/about"));
    expect(mockedNext).toHaveBeenCalledTimes(1);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("passes through public paths even when nested under requireAuth", async () => {
    const proxy = createAuthProxy(makeHelpers(null), {
      requireAuth: ["/"],
      publicPaths: ["/sign-in"],
    });
    await proxy(makeRequest("/sign-in"));
    expect(mockedNext).toHaveBeenCalledTimes(1);
  });

  it("redirects to /sign-in with next= when accessing a protected path unauthenticated", async () => {
    const proxy = createAuthProxy(makeHelpers(null), { requireAuth: ["/dashboard"] });
    await proxy(makeRequest("/dashboard/settings", "?tab=billing"));
    expect(mockedRedirect).toHaveBeenCalledTimes(1);
    const url = mockedRedirect.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe("/dashboard/settings?tab=billing");
  });

  it("passes through when authenticated and role matches", async () => {
    const proxy = createAuthProxy(makeHelpers({ id: "u1", role: "admin" }), {
      requireRole: [{ prefix: "/admin", role: "admin" }],
    });
    await proxy(makeRequest("/admin/users"));
    expect(mockedNext).toHaveBeenCalledTimes(1);
  });

  it("passes through when authenticated role is higher than required", async () => {
    const proxy = createAuthProxy(makeHelpers({ id: "u1", role: "owner" }), {
      requireRole: [{ prefix: "/admin", role: "admin" }],
    });
    await proxy(makeRequest("/admin/users"));
    expect(mockedNext).toHaveBeenCalledTimes(1);
  });

  it("redirects authenticated user without required role to forbiddenPath", async () => {
    const proxy = createAuthProxy(makeHelpers({ id: "u1", role: "member" }), {
      requireRole: [{ prefix: "/admin", role: "admin" }],
      forbiddenPath: "/403",
    });
    await proxy(makeRequest("/admin/users"));
    const url = mockedRedirect.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/403");
  });

  it("respects custom signInPath and nextParam", async () => {
    const proxy = createAuthProxy(makeHelpers(null), {
      requireAuth: ["/x"],
      signInPath: "/login",
      nextParam: "to",
    });
    await proxy(makeRequest("/x/y"));
    const url = mockedRedirect.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("to")).toBe("/x/y");
  });
});
