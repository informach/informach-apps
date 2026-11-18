import "server-only";
import { getRuntimeDaCompra, getRuntimeDaConsultaDaCompra } from "@/lib/billing";
import { criarConsultaDeCompra, criarExecutorDeCompra } from "./execucao-service";

export const executarMinhaCompra = criarExecutorDeCompra(getRuntimeDaCompra);
export const conferirMinhaCompraNoProvedor = criarConsultaDeCompra(getRuntimeDaConsultaDaCompra);
