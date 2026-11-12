/**
 * Opções do Chromium dos testes de navegador. O Morada desenha em WebGL, e o
 * navegador de teste desenha por software (SwiftShader), para o resultado não
 * depender da placa de vídeo da máquina: as mesmas opções de
 * `packages/jogo-morada/e2e/playwright.config.ts`.
 *
 * Fica em arquivo próprio porque a configuração do Playwright e os testes que
 * abrem um navegador à parte usam a mesma lista.
 */
export const ARGS_DO_NAVEGADOR = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];
