"use client";
import { createInformachAuthClient } from "@informach/auth/client";
export const authClient = createInformachAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3006",
  desktopOAuth: true,
  email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" },
});
