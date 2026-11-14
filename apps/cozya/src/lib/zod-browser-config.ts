import { z } from "zod";

// O Cozya mantém uma CSP sem unsafe-eval; configure antes da primeira validação.
z.config({ jitless: true });
