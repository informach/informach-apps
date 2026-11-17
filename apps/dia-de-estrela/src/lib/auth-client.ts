"use client";
import { createWebSsoAuthClient } from "@informach/auth/web-sso-client";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
export const ssoEnvironment = webSsoEnvironment("dia-de-estrela", process.env.NEXT_PUBLIC_APP_URL);

export const authClient = createWebSsoAuthClient("dia-de-estrela", ssoEnvironment);
