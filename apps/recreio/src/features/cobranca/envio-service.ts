import "server-only";
import { getRuntimeDaCompra } from "@/lib/billing";
import { criarExecutorDeCompra } from "./execucao-service";

export const executarMinhaCompra = criarExecutorDeCompra(getRuntimeDaCompra);
