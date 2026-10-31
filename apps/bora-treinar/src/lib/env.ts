import "server-only";
import { validateEnvironment } from "./environment";

export const env = validateEnvironment(process.env);
