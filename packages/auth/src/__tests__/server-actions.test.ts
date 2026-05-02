import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const dbInsertChain: {
  rows: Array<{ count: number }>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
} = {
  rows: [],
  values: vi.fn(() => dbInsertChain),
  onConflictDoUpdate: vi.fn(() => dbInsertChain),
  returning: vi.fn(async () => dbInsertChain.rows),
};

vi.mock("@informach/db", () => ({
  db: {
    insert: vi.fn(() => dbInsertChain),
  },
}));

vi.mock("@informach/db/schema", () => ({
  rateLimit: {
    __mock: "rateLimit",
    id: "rate_limit.id",
    key: "rate_limit.key",
    count: "rate_limit.count",
    lastRequest: "rate_limit.last_request",
  },
  events: { __mock: "events" },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));

import { ForbiddenError, UnauthorizedError } from "../helpers";
import { createActionFactory, parseWindowSeconds, RateLimitError } from "../server-actions";

type TestUser = { id: string; role?: string };
type TestSession = { id: string };

function makeHelpers(opts: {
  currentUser?: TestUser | null;
  requireRoleThrows?: boolean;
  permissionThrows?: boolean;
  member?: { id: string; userId?: string; organizationId?: string; role?: string } | null;
  orgRoleMismatch?: boolean;
}) {
  const user = opts.currentUser ?? null;
  return {
    getSession: vi.fn(),
    getCurrentUser: vi.fn(async () => user),
    requireUser: vi.fn(async () => {
      if (!user) throw new UnauthorizedError();
      return user;
    }),
    requireRole: vi.fn(),
    requireAdmin: vi.fn(),
    hasRole: vi.fn(),
    assertRole: vi.fn(() => {
      if (opts.requireRoleThrows) throw new ForbiddenError("role required");
    }),
    assertPermission: vi.fn(() => {
      if (opts.permissionThrows) throw new ForbiddenError("permission denied");
    }),
    hasAccessToProduct: vi.fn(),
    getActiveOrganization: vi.fn(),
    getActiveMember: vi.fn(async () => opts.member ?? null),
    listUserOrganizations: vi.fn(),
    requireOrgMember: vi.fn(async () => {
      if (!user) throw new UnauthorizedError();
      if (!opts.member) throw new ForbiddenError("user has no active organization membership");
      if (opts.orgRoleMismatch) throw new ForbiddenError(`organization role required`);
      return { user, member: opts.member, organization: null };
    }),
  } as const;
}

describe("parseWindowSeconds", () => {
  it("accepts numeric seconds", () => {
    expect(parseWindowSeconds(30)).toBe(30);
  });

  it("parses 30s, 1m, 2h, 1d", () => {
    expect(parseWindowSeconds("30s")).toBe(30);
    expect(parseWindowSeconds("1m")).toBe(60);
    expect(parseWindowSeconds("2h")).toBe(7200);
    expect(parseWindowSeconds("1d")).toBe(86400);
  });

  it("rejects invalid windows", () => {
    expect(() => parseWindowSeconds("abc")).toThrow(/Invalid rateLimit window/);
    expect(() => parseWindowSeconds(-1)).toThrow(/Invalid rateLimit window/);
  });
});

describe("createActionFactory — basic flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("validates input through the zod schema", async () => {
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action
      .input(z.object({ name: z.string().min(1) }))
      .run(async ({ input }) => input.name);
    await expect(fn({ name: "ok" })).resolves.toBe("ok");
    await expect(fn({ name: "" })).rejects.toThrow();
  });

  it("does not call helpers when auth.require is none", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1" } });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "none" }).run(async ({ ctx }) => ctx.actor);
    await expect(fn({})).resolves.toBeNull();
    expect(helpers.requireUser).not.toHaveBeenCalled();
    expect(helpers.getCurrentUser).not.toHaveBeenCalled();
  });
});

describe("createActionFactory — auth.require: 'user'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("attaches the actor when authenticated", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1" } });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "user" }).run(async ({ ctx }) => ctx.actor);
    await expect(fn({})).resolves.toEqual({ id: "u1" });
  });

  it("propagates UnauthorizedError when no session", async () => {
    const helpers = makeHelpers({ currentUser: null });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "user" }).run(async ({ ctx }) => ctx.actor);
    await expect(fn({})).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("createActionFactory — auth.require: 'member-of-org'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("attaches the actor when user has active membership", async () => {
    const helpers = makeHelpers({
      currentUser: { id: "u1" },
      member: { id: "m1", userId: "u1", organizationId: "org1", role: "admin" },
    });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "member-of-org" }).run(async ({ ctx }) => ctx.actor);
    await expect(fn({})).resolves.toEqual({ id: "u1" });
    expect(helpers.requireOrgMember).toHaveBeenCalled();
  });

  it("propagates ForbiddenError when user has no active membership", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1" }, member: null });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "member-of-org" }).run(async () => "ok");
    await expect(fn({})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forwards orgRole to requireOrgMember", async () => {
    const helpers = makeHelpers({
      currentUser: { id: "u1" },
      member: { id: "m1", role: "owner" },
    });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "member-of-org", orgRole: "owner" }).run(async () => "ok");
    await fn({});
    expect(helpers.requireOrgMember).toHaveBeenCalledWith(expect.anything(), "owner");
  });
});

describe("createActionFactory — auth.require: 'role'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("calls assertRole when role is set", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1", role: "admin" } });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "role", role: "admin" }).run(async () => "ok");
    await fn({});
    expect(helpers.assertRole).toHaveBeenCalledWith({ id: "u1", role: "admin" }, "admin");
  });

  it("propagates ForbiddenError when assertRole throws", async () => {
    const helpers = makeHelpers({
      currentUser: { id: "u1", role: "member" },
      requireRoleThrows: true,
    });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "role", role: "admin" }).run(async () => "ok");
    await expect(fn({})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("calls assertPermission when permission is set", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1", role: "admin" } });
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.auth({ require: "role", permission: "users.list" }).run(async () => "ok");
    await fn({});
    expect(helpers.assertPermission).toHaveBeenCalledWith(
      { id: "u1", role: "admin" },
      "users.list",
    );
  });
});

describe("createActionFactory — rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("inserts a new rate-limit row when key is unknown", async () => {
    dbInsertChain.rows = [{ count: 1 }];
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.rateLimit({ key: "test", max: 3, window: "1m" }).run(async () => "ok");
    await fn({});
    expect(dbInsertChain.values).toHaveBeenCalledTimes(1);
    expect(dbInsertChain.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(dbInsertChain.returning).toHaveBeenCalledTimes(1);
  });

  it("allows the action when the upserted count is below max", async () => {
    dbInsertChain.rows = [{ count: 2 }];
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.rateLimit({ key: "test", max: 3, window: "1m" }).run(async () => "ok");
    await expect(fn({})).resolves.toBe("ok");
  });

  it("throws RateLimitError when the atomic upserted count exceeds max", async () => {
    dbInsertChain.rows = [{ count: 6 }];
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.rateLimit({ key: "test", max: 5, window: "1m" }).run(async () => "ok");
    await expect(fn({})).rejects.toBeInstanceOf(RateLimitError);
  });

  it("rejects invalid max values", async () => {
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.rateLimit({ key: "test", max: 0, window: "1m" }).run(async () => "ok");
    await expect(fn({})).rejects.toThrow(/Invalid rateLimit max/);
  });

  it("uses a single upsert for concurrent-safe counting", async () => {
    dbInsertChain.rows = [{ count: 1 }];
    const helpers = makeHelpers({});
    const { action } = createActionFactory<TestUser, TestSession>({ helpers });
    const fn = action.rateLimit({ key: "test", max: 3, window: "1m" }).run(async () => "ok");
    await fn({});
    expect(dbInsertChain.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: "rate_limit.key" }),
    );
  });
});

describe("createActionFactory — audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertChain.rows = [];
  });

  it("calls onAudit and writes audit event with actor id", async () => {
    const helpers = makeHelpers({ currentUser: { id: "u1" } });
    const onAudit = vi.fn();
    const { action } = createActionFactory<TestUser, TestSession>({ helpers, onAudit });
    const fn = action
      .auth({ require: "user" })
      .audit("user.action_invoked")
      .run(async () => "ok");
    await fn({});
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "user.action_invoked",
      actorId: "u1",
    });
    expect(dbInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "user.action_invoked", actorId: "u1" }),
    );
  });

  it("logs null actorId when there is no session", async () => {
    const helpers = makeHelpers({ currentUser: null });
    const onAudit = vi.fn();
    const { action } = createActionFactory<TestUser, TestSession>({ helpers, onAudit });
    const fn = action
      .auth({ require: "none" })
      .audit("anonymous.event")
      .run(async () => "ok");
    await fn({});
    expect(onAudit).toHaveBeenCalledWith({
      eventType: "anonymous.event",
      actorId: null,
    });
  });
});
