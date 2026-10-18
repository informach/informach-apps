import { z } from "zod";
export const artboardIdSchema = z.string().regex(/^artboard-[\w-]{1,100}$/);
