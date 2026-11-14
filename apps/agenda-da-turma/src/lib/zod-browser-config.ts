import { z } from "zod";

// A Agenda mantém uma CSP sem unsafe-eval; configure antes da primeira validação.
z.config({ jitless: true });
