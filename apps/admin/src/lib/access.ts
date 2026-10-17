import "server-only";
import { ForbiddenError, isUserBanned, UnauthorizedError } from "@informach/auth";
import { eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { readDb } from "./read-db";
import { isStaffRole, type StaffRole } from "./roles";

export type Staff = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
};

export type StaffState =
  | { kind: "anonymous" }
  | { kind: "no_access" }
  | { kind: "needs_two_factor"; staff: Staff }
  | { kind: "staff"; staff: Staff };

/**
 * Lê papel, duas etapas e banimento direto de `core.users`, não do objeto da
 * sessão: um papel retirado ou um banimento valem no próximo pedido, sem esperar
 * a sessão vencer.
 */
export const getStaffState = cache(async (): Promise<StaffState> => {
  const session = await getAuth().getSession(await headers());
  if (!session) return { kind: "anonymous" };
  const [row] = await readDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      banExpiresAt: users.banExpiresAt,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row || !isStaffRole(row.role) || isUserBanned(row)) return { kind: "no_access" };
  const staff: Staff = { id: row.id, name: row.name, email: row.email, role: row.role };
  if (!row.twoFactorEnabled) return { kind: "needs_two_factor", staff };
  return { kind: "staff", staff };
});

/** Guarda das telas: quem não pode ver é levado à entrada certa. */
export async function requireStaff(): Promise<Staff> {
  const state = await getStaffState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind === "no_access") redirect("/sem-acesso");
  if (state.kind === "needs_two_factor") redirect("/duas-etapas");
  return state.staff;
}

/** Guarda das ações e das rotas: falha em vez de redirecionar. */
export async function requireStaffForAction(): Promise<Staff> {
  const state = await getStaffState();
  if (state.kind === "anonymous") throw new UnauthorizedError();
  if (state.kind !== "staff") throw new ForbiddenError("staff with two-factor required");
  return state.staff;
}

export async function requireOwnerForAction(): Promise<Staff> {
  const staff = await requireStaffForAction();
  if (staff.role !== "owner") throw new ForbiddenError("owner required");
  return staff;
}

export function firstName(staff: Pick<Staff, "name" | "email">): string {
  const name = staff.name.trim().split(/\s+/)[0];
  return name || staff.email.split("@")[0] || "equipe";
}
