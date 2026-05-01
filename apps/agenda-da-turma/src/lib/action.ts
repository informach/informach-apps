import type { z } from "zod";
import { logger } from "./logger";

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

type AuthRequirement = "none" | "user" | "member-of-org";

type ActionContext = {
  actor: { id: string } | null;
};

type ActionHandler<TInput, TOutput> = (args: {
  input: TInput;
  ctx: ActionContext;
}) => Promise<TOutput>;

type ActionConfig<TSchema extends z.ZodTypeAny> = {
  schema?: TSchema;
  auth?: { require: AuthRequirement };
  rateLimit?: { key: string; max: number; window: string };
  audit?: string;
};

class ActionBuilder<TSchema extends z.ZodTypeAny> {
  constructor(private readonly config: ActionConfig<TSchema> = {}) {}

  input<S extends z.ZodTypeAny>(schema: S): ActionBuilder<S> {
    return new ActionBuilder({ ...this.config, schema } as ActionConfig<S>);
  }

  auth(opts: { require: AuthRequirement }): ActionBuilder<TSchema> {
    return new ActionBuilder({ ...this.config, auth: opts });
  }

  rateLimit(opts: { key: string; max: number; window: string }): ActionBuilder<TSchema> {
    return new ActionBuilder({ ...this.config, rateLimit: opts });
  }

  audit(eventType: string): ActionBuilder<TSchema> {
    return new ActionBuilder({ ...this.config, audit: eventType });
  }

  run<TOutput>(
    handler: ActionHandler<z.infer<TSchema>, TOutput>,
  ): (rawInput: unknown) => Promise<TOutput> {
    const { schema, audit } = this.config;

    return async (rawInput: unknown) => {
      // TODO: resolver auth real (getCurrentUser do @informach/auth) quando o package implementar.
      // TODO: aplicar rate-limit (Redis/Upstash) quando definirmos provider.
      // TODO: gravar audit log em audit.events via @informach/db.
      const input = schema
        ? (schema.parse(rawInput) as z.infer<TSchema>)
        : (rawInput as z.infer<TSchema>);
      const ctx: ActionContext = { actor: null };

      if (audit) {
        logger.info({ eventType: audit }, "action.invoke");
      }

      return handler({ input, ctx });
    };
  }
}

export const action = new ActionBuilder();
