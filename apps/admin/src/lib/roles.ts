/** Papéis de `@informach/auth` que entram no Bastidores. */
export const STAFF_ROLES = ["owner", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: unknown): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "owner",
  admin: "admin",
};
