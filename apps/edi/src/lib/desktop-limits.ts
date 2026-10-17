import "server-only";
import { MAX_DEVICE_ACTIVATIONS, MAX_LEASE_SECONDS } from "@informach/edi-contracts";

// Lidos só no servidor: o índice do contrato traz o zod e os schemas, que não
// devem ir para o navegador. Componentes de cliente recebem os números por props.

/** Computadores por conta, o mesmo número que o backend aplica na ativação. */
export const DEVICE_LIMIT = MAX_DEVICE_ACTIVATIONS;
/** Horas de uso sem internet depois da última renovação da licença. */
export const OFFLINE_HOURS = MAX_LEASE_SECONDS / 3600;
