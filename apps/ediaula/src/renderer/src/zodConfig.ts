import { z } from "zod";

// Imported first by main.tsx, before any schema is parsed: zod 4 would otherwise probe once
// whether it may compile validators with `new Function("")`, and the renderer's CSP (no
// 'unsafe-eval') answers with an error in the console. Validation is the same without it.
z.config({ jitless: true });
