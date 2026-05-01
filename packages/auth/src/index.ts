export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`@informach/auth: ${feature} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export type User = {
  id: string;
  email: string;
  name: string | null;
};

export type Role = "owner" | "admin" | "member" | "guest";

export type Permission = string;

export async function getCurrentUser(): Promise<User | null> {
  throw new NotImplementedError("getCurrentUser");
}

export async function requireUser(): Promise<User> {
  throw new NotImplementedError("requireUser");
}

export async function hasRole(_userId: string, _role: Role): Promise<boolean> {
  throw new NotImplementedError("hasRole");
}

export async function assertPermission(_userId: string, _permission: Permission): Promise<void> {
  throw new NotImplementedError("assertPermission");
}

export async function hasAccessToProduct(_userId: string, _productId: string): Promise<boolean> {
  throw new NotImplementedError("hasAccessToProduct");
}
