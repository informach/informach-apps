import { createInformachAuthClient } from "@informach/auth/client";
import { env } from "./env";

export const authClient = createInformachAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
