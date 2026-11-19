import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

// Inventário global exige banco próprio; fixtures de outros testes não podem
// ser filtradas do protocolo de backup só para tornar o teste verde.
export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.backup-capture.ts"] },
});
