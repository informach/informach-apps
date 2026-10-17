import { randomBytes } from "node:crypto";
import { db } from "@informach/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { desktopOAuthPlugins } from "../src/desktop-oauth";

// Schema generation only. No remote providers, email delivery or DB writes.
export const auth = betterAuth({
  baseURL: "http://localhost:3006",
  secret: randomBytes(32).toString("hex"),
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: desktopOAuthPlugins({
    audience: "http://localhost:3006/api/desktop",
    clientId: "edi-desktop-development",
  }),
});
