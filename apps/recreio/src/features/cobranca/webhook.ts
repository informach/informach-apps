import "server-only";
import { getRuntimeDoWebhook } from "@/lib/billing";
import { criarReceptorDoWebhook } from "./webhook-service";

export const receberWebhook = criarReceptorDoWebhook(getRuntimeDoWebhook);
