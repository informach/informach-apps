import "server-only";
import { getRuntimeDoPortal } from "@/lib/billing";
import { criarAberturaDoPortal } from "./portal-service";

export const abrirMeuPortal = criarAberturaDoPortal(getRuntimeDoPortal);
