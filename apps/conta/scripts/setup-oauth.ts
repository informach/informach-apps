import { provisionWebSso } from "@informach/auth/web-sso";
import { createDatabaseConnection } from "@informach/db";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for OIDC setup");
  const connection = createDatabaseConnection(databaseUrl);
  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  try {
    await provisionWebSso(connection.db, environment);
    console.log("Account OIDC clients match the registered applications.");
  } finally {
    await connection.close();
  }
}
void main().catch(() => {
  console.error("Account OIDC provisioning failed.");
  process.exitCode = 1;
});
