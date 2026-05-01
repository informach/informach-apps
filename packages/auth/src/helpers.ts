import { type Permission, type Role, roleHasPermission } from "./permissions";

export class UnauthorizedError extends Error {
  constructor() {
    super("@informach/auth: user is not authenticated");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(reason: string) {
    super(`@informach/auth: ${reason}`);
    this.name = "ForbiddenError";
  }
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`@informach/auth: ${feature} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export class OrganizationsDisabledError extends Error {
  constructor() {
    super(
      "@informach/auth: organizations plugin is not enabled — add `organizations: { enabled: true }` to createAuth config",
    );
    this.name = "OrganizationsDisabledError";
  }
}

export type { Permission, Role } from "./permissions";

type UserWithRole = { role?: Role | string | null };
type MemberLike = { id: string; userId?: string; organizationId?: string; role?: string };
type OrganizationLike = { id: string; name?: string; slug?: string };

type SessionLike<TUser, TSession> = { user: TUser; session: TSession } | null | undefined;

type AuthApi<TUser, TSession> = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<SessionLike<TUser, TSession>>;
    getActiveMember?: (input: { headers: Headers }) => Promise<MemberLike | null>;
    getFullOrganization?: (input: { headers: Headers }) => Promise<OrganizationLike | null>;
    listOrganizations?: (input: { headers: Headers }) => Promise<OrganizationLike[]>;
  };
};

export type RequireOrgMemberResult<TUser> = {
  user: TUser;
  member: MemberLike;
  organization: OrganizationLike | null;
};

export type Helpers<TUser, TSession> = {
  getSession: (headers: Headers) => Promise<{ user: TUser; session: TSession } | null>;
  getCurrentUser: (headers: Headers) => Promise<TUser | null>;
  requireUser: (headers: Headers) => Promise<TUser>;
  requireRole: (headers: Headers, role: Role) => Promise<TUser>;
  requireAdmin: (headers: Headers) => Promise<TUser>;
  hasRole: (user: TUser, role: Role) => boolean;
  assertRole: (user: TUser, role: Role) => void;
  assertPermission: (user: TUser, permission: Permission) => void;
  hasAccessToProduct: (userId: string, productId: string) => Promise<boolean>;
  getActiveOrganization: (headers: Headers) => Promise<OrganizationLike | null>;
  getActiveMember: (headers: Headers) => Promise<MemberLike | null>;
  listUserOrganizations: (headers: Headers) => Promise<OrganizationLike[]>;
  requireOrgMember: (headers: Headers, role?: string) => Promise<RequireOrgMemberResult<TUser>>;
};

function readRole(user: unknown): Role | null {
  if (typeof user !== "object" || user === null) return null;
  const role = (user as UserWithRole).role;
  return typeof role === "string" ? (role as Role) : null;
}

export function buildHelpers<TUser, TSession>(
  auth: AuthApi<TUser, TSession>,
): Helpers<TUser, TSession> {
  async function getSession(headers: Headers) {
    const session = await auth.api.getSession({ headers });
    return session ?? null;
  }

  async function getCurrentUser(headers: Headers) {
    const session = await getSession(headers);
    return session?.user ?? null;
  }

  async function requireUser(headers: Headers) {
    const user = await getCurrentUser(headers);
    if (!user) {
      throw new UnauthorizedError();
    }
    return user;
  }

  function hasRole(user: TUser, role: Role): boolean {
    return readRole(user) === role;
  }

  function assertRole(user: TUser, role: Role): void {
    if (!hasRole(user, role)) {
      throw new ForbiddenError(`role "${role}" required`);
    }
  }

  function assertPermission(user: TUser, permission: Permission): void {
    const role = readRole(user);
    if (!role) {
      throw new ForbiddenError(`permission "${permission}" denied: missing role`);
    }
    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenError(`permission "${permission}" denied for role "${role}"`);
    }
  }

  async function requireRole(headers: Headers, role: Role) {
    const user = await requireUser(headers);
    assertRole(user, role);
    return user;
  }

  async function requireAdmin(headers: Headers) {
    return requireRole(headers, "admin");
  }

  async function hasAccessToProduct(_userId: string, _productId: string): Promise<boolean> {
    throw new NotImplementedError("hasAccessToProduct");
  }

  async function getActiveMember(headers: Headers) {
    if (typeof auth.api.getActiveMember !== "function") {
      throw new OrganizationsDisabledError();
    }
    return (await auth.api.getActiveMember({ headers })) ?? null;
  }

  async function getActiveOrganization(headers: Headers) {
    if (typeof auth.api.getFullOrganization !== "function") {
      throw new OrganizationsDisabledError();
    }
    return (await auth.api.getFullOrganization({ headers })) ?? null;
  }

  async function listUserOrganizations(headers: Headers) {
    if (typeof auth.api.listOrganizations !== "function") {
      throw new OrganizationsDisabledError();
    }
    return (await auth.api.listOrganizations({ headers })) ?? [];
  }

  async function requireOrgMember(
    headers: Headers,
    role?: string,
  ): Promise<RequireOrgMemberResult<TUser>> {
    const user = await requireUser(headers);
    const member = await getActiveMember(headers);
    if (!member) {
      throw new ForbiddenError("user has no active organization membership");
    }
    if (role && member.role !== role) {
      throw new ForbiddenError(`organization role "${role}" required`);
    }
    let organization: OrganizationLike | null = null;
    if (typeof auth.api.getFullOrganization === "function") {
      organization = (await auth.api.getFullOrganization({ headers })) ?? null;
    }
    return { user, member, organization };
  }

  return {
    getSession,
    getCurrentUser,
    requireUser,
    requireRole,
    requireAdmin,
    hasRole,
    assertRole,
    assertPermission,
    hasAccessToProduct,
    getActiveOrganization,
    getActiveMember,
    listUserOrganizations,
    requireOrgMember,
  };
}
