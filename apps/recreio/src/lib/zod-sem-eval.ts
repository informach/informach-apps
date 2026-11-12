import { z } from "zod";

/**
 * No navegador, o Zod roda sem compilar validadores. Por padrão ele testa se
 * pode usar `new Function` na primeira vez que confere um objeto; a política de
 * segurança do portal não permite `eval`, e o teste, mesmo capturado, aparece
 * como violação no console e nos relatórios. Com `jitless` o Zod nem tenta.
 *
 * Quem leva o Zod ao navegador é o SDK do Recreio (as respostas do portal são
 * conferidas contra o contrato). Todo componente de navegador que usa o SDK
 * importa este arquivo antes. No servidor nada muda.
 */
if (typeof window !== "undefined") z.config({ jitless: true });
