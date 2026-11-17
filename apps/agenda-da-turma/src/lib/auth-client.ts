"use client";
import { createWebSsoAuthClient } from "@informach/auth/web-sso-client";
import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
export const ssoEnvironment = webSsoEnvironment("agenda-da-turma", process.env.NEXT_PUBLIC_APP_URL);

export const authClient = createWebSsoAuthClient("agenda-da-turma", ssoEnvironment);

export const { signOut, useSession } = authClient;
