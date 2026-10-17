import { passkey } from "@better-auth/passkey";
import {
  invitations,
  members,
  organizations,
  passkeys,
  sessions,
  twoFactors,
  users,
} from "@informach/db/schema";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { describe, expect, it } from "vitest";

/**
 * O schema é do Drizzle (`@informach/db`), não da CLI do Better Auth. Quando um
 * plugin opcional ganha campo numa versão nova, o app que liga o plugin quebra
 * na primeira requisição com "Drizzle schema mismatch". Foi o que aconteceu com
 * `failedVerificationCount` e `lockedUntil` das duas etapas no Better Auth 1.7.
 * Este teste pega a diferença antes de algum app ligar o plugin.
 */
const TABLES: Record<string, object> = {
  user: users,
  session: sessions,
  twoFactor: twoFactors,
  organization: organizations,
  member: members,
  invitation: invitations,
  passkey: passkeys,
};

const PLUGINS = {
  twoFactor: twoFactor({ issuer: "teste" }),
  organization: organization(),
  passkey: passkey(),
};

describe("campos dos plugins opcionais no schema Drizzle", () => {
  for (const [name, plugin] of Object.entries(PLUGINS)) {
    it(`${name}: toda coluna que o plugin exige existe`, () => {
      const schema = (plugin as { schema?: Record<string, { fields: Record<string, unknown> }> })
        .schema;
      expect(schema).toBeDefined();
      const missing: string[] = [];
      for (const [model, definition] of Object.entries(schema ?? {})) {
        const table = TABLES[model];
        if (!table) {
          missing.push(`${model} (tabela sem mapeamento)`);
          continue;
        }
        for (const field of Object.keys(definition.fields)) {
          if (!(field in table)) missing.push(`${model}.${field}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }
});
