"use client";
import { createWebSsoAuthClient } from "@informach/auth/web-sso-client";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
export const ssoEnvironment = webSsoEnvironment("cozya", process.env.NEXT_PUBLIC_APP_URL);

export const authClient = createWebSsoAuthClient("cozya", ssoEnvironment);

export const { signOut, useSession } = authClient;
