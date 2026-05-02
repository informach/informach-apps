export const ROLES = ["owner", "admin", "member", "guest"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "users.list": ["owner", "admin"],
  "users.invite": ["owner", "admin"],
  "users.set_role": ["owner"],
  "users.ban": ["owner", "admin"],
  "billing.manage": ["owner"],
  "content.create": ["owner", "admin", "member"],
  "content.delete": ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleSatisfies(role: Role, requiredRole: Role): boolean {
  return ROLES.indexOf(role) <= ROLES.indexOf(requiredRole);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
