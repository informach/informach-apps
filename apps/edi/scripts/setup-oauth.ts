import { provisionDesktopOAuth } from "@informach/auth/desktop";
import { createDatabaseConnection } from "@informach/db";
import { getEnv } from "../src/lib/env";

async function main() {
  const env = getEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for desktop OAuth setup");
  const connection = createDatabaseConnection(databaseUrl);
  const failures: unknown[] = [];
  try {
    await provisionDesktopOAuth(connection.db, {
      audience: `${env.NEXT_PUBLIC_APP_URL}/api/desktop`,
      clientId: env.EDI_DESKTOP_CLIENT_ID,
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    await connection.close();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length) throw new AggregateError(failures, "Desktop OAuth setup failed");
  console.log("Edi public native OAuth client configured; no client secret created.");
}
void main().catch((error: unknown) => {
  // Do not log deployment variables, private keys or provider query parameters.
  console.error(
    "Edi desktop OAuth setup failed",
    error instanceof Error ? error.name : "unknown_error",
  );
  process.exitCode = 1;
});
