import "server-only";
import { db } from "@informach/db";
import { rateLimit as rateLimitTable } from "@informach/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import type { z } from "zod";
import type { AuditEventType } from "./audit";
import { logAuditEvent } from "./audit";
import {
  ForbiddenError,
  type Helpers,
  OrganizationsDisabledError,
  UnauthorizedError,
} from "./helpers";
import type { Permission, Role } from "./permissions";

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export class RateLimitError extends Error {
  constructor(public readonly key: string) {
    super(`@informach/auth: rate limit exceeded for "${key}"`);
    this.name = "RateLimitError";
  }
}

export type AuthRequirement = "none" | "user" | "role" | "member-of-org";

export type ActionAuthConfig = {
  require: AuthRequirement;
  role?: Role;
  permission?: Permission;
  /** When require is "member-of-org": optional organization role to enforce. */
  orgRole?: string;
};

export type ActionRateLimitConfig = {
  key: string;
  max: number;
  /** Window in seconds, or short form like "30s", "1m", "5m", "1h". */
  window: number | string;
};

export type ActionContext<TUser> = {
  actor: TUser | null;
};

export type ActionHandler<TInput, TUser, TOutput> = (args: {
  input: TInput;
  ctx: ActionContext<TUser>;
}) => Promise<TOutput>;

const WINDOW_PATTERN = /^(\d+)\s*([smhd])$/i;
const WINDOW_MULTIPLIERS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseWindowSeconds(window: number | string): number {
  if (typeof window === "number") {
    if (!Number.isFinite(window) || window <= 0) {
      throw new Error(`Invalid rateLimit window: ${window}`);
    }
    return Math.floor(window);
  }
  const match = WINDOW_PATTERN.exec(window.trim());
  if (!match) {
    throw new Error(`Invalid rateLimit window: "${window}"`);
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const multiplier = WINDOW_MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid rateLimit window unit: "${unit}"`);
  }
  return amount * multiplier;
}

export async function enforceRateLimit(input: ActionRateLimitConfig): Promise<void> {
  const windowSeconds = parseWindowSeconds(input.window);
  if (!Number.isFinite(input.max) || input.max <= 0) {
    throw new Error(`Invalid rateLimit max: ${input.max}`);
  }
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const [row] = await db
    .insert(rateLimitTable)
    .values({
      id: crypto.randomUUID(),
      key: input.key,
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimitTable.key,
      set: {
        count: sql<number>`case when ${rateLimitTable.lastRequest} > ${windowStart} then ${rateLimitTable.count} + 1 else 1 end`,
        lastRequest: now,
      },
    })
    .returning({
      count: rateLimitTable.count,
    });

  if (row && row.count > input.max) {
    throw new RateLimitError(input.key);
  }
}

export type ActionFactoryHelpers<TUser, TSession> = Pick<
  Helpers<TUser, TSession>,
  "getCurrentUser" | "requireUser" | "assertRole" | "assertPermission" | "requireOrgMember"
>;

export type ActionFactoryConfig<TUser, TSession> = {
  helpers: ActionFactoryHelpers<TUser, TSession>;
  /** Logger called for `audit("event")`. Receives the event type and serialized actor id. */
  onAudit?: (input: { eventType: AuditEventType; actorId: string | null }) => void;
};

type ActionConfig<TSchema extends z.ZodTypeAny> = {
  schema?: TSchema;
  auth?: ActionAuthConfig;
  rateLimit?: ActionRateLimitConfig;
  audit?: AuditEventType;
};

type RequestHeadersProvider = () => Promise<Headers>;

async function defaultRequestHeaders(): Promise<Headers> {
  const value = await headers();
  return value as unknown as Headers;
}

class ActionBuilder<TUser, TSession, TSchema extends z.ZodTypeAny> {
  constructor(
    private readonly factory: ActionFactoryConfig<TUser, TSession>,
    private readonly getRequestHeaders: RequestHeadersProvider,
    private readonly config: ActionConfig<TSchema> = {},
  ) {}

  input<S extends z.ZodTypeAny>(schema: S): ActionBuilder<TUser, TSession, S> {
    return new ActionBuilder(this.factory, this.getRequestHeaders, {
      ...this.config,
      schema,
    } as ActionConfig<S>);
  }

  auth(opts: ActionAuthConfig): ActionBuilder<TUser, TSession, TSchema> {
    return new ActionBuilder(this.factory, this.getRequestHeaders, {
      ...this.config,
      auth: opts,
    });
  }

  rateLimit(opts: ActionRateLimitConfig): ActionBuilder<TUser, TSession, TSchema> {
    return new ActionBuilder(this.factory, this.getRequestHeaders, {
      ...this.config,
      rateLimit: opts,
    });
  }

  audit(eventType: AuditEventType): ActionBuilder<TUser, TSession, TSchema> {
    return new ActionBuilder(this.factory, this.getRequestHeaders, {
      ...this.config,
      audit: eventType,
    });
  }

  run<TOutput>(
    handler: ActionHandler<z.infer<TSchema>, TUser, TOutput>,
  ): (rawInput: unknown) => Promise<TOutput> {
    const { schema, auth, rateLimit, audit } = this.config;
    const factory = this.factory;
    const getRequestHeaders = this.getRequestHeaders;

    return async (rawInput: unknown) => {
      const input = schema
        ? (schema.parse(rawInput) as z.infer<TSchema>)
        : (rawInput as z.infer<TSchema>);

      const requestHeaders = auth && auth.require !== "none" ? await getRequestHeaders() : null;

      let actor: TUser | null = null;
      if (requestHeaders) {
        if (auth?.require === "user") {
          actor = await factory.helpers.requireUser(requestHeaders);
        } else if (auth?.require === "role") {
          actor = await factory.helpers.requireUser(requestHeaders);
          if (auth.role) factory.helpers.assertRole(actor, auth.role);
          if (auth.permission) factory.helpers.assertPermission(actor, auth.permission);
        } else if (auth?.require === "member-of-org") {
          const result = await factory.helpers.requireOrgMember(requestHeaders, auth.orgRole);
          actor = result.user;
        } else {
          actor = await factory.helpers.getCurrentUser(requestHeaders);
        }
      }

      if (rateLimit) {
        await enforceRateLimit(rateLimit);
      }

      if (audit) {
        const actorId = actorIdOf(actor);
        await logAuditEvent(audit, actorId, {});
        factory.onAudit?.({ eventType: audit, actorId });
      }

      const ctx: ActionContext<TUser> = { actor };
      return handler({ input, ctx });
    };
  }
}

function actorIdOf(actor: unknown): string | null {
  if (typeof actor !== "object" || actor === null) return null;
  const id = (actor as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function createActionFactory<TUser, TSession>(
  config: ActionFactoryConfig<TUser, TSession>,
  getRequestHeaders: RequestHeadersProvider = defaultRequestHeaders,
) {
  const action = new ActionBuilder<TUser, TSession, z.ZodTypeAny>(config, getRequestHeaders);
  return {
    action,
    ok,
    err,
    UnauthorizedError,
    ForbiddenError,
    OrganizationsDisabledError,
    RateLimitError,
  };
}
