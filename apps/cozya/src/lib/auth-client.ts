import { createInformachAuthClient } from "@informach/auth/client";
import { env } from "./env";

export const authClient = createInformachAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  // Mirrors apps/cozya/src/lib/auth.ts: password login stays enabled;
  // OTP handles e-mail confirmations and optional passwordless login.
  email: {
    verification: "otp",
    signIn: { magicLink: false, otp: true },
    forgetPassword: "otp",
  },
});

export const { signIn, signUp, signOut, useSession, emailOtp, forgetPassword } = authClient;
