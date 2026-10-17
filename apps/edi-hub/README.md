# Edi Hub

Central Electron para instalar, abrir e atualizar as ferramentas da suíte Edi. O portal de conta, cobrança e licenças fica em `apps/edi`; os editores são aplicativos independentes.

O [guia de desenvolvimento Edi](../../docs/desenvolvimento-edi.md) explica ambiente local, perfis isolados, login/licença, organização do código, testes, recursos nativos e distribuição. Leia-o antes de iniciar o app para não reutilizar dados pessoais nos testes.

Na raiz do repositório, depois de configurar o ambiente e o perfil de desenvolvimento:

```powershell
pnpm --filter @informach/edi-hub dev
```

Verificações e preview local:

```powershell
pnpm --filter @informach/edi-hub test
pnpm --filter @informach/edi-hub typecheck
pnpm --filter @informach/edi-hub build
pnpm --filter @informach/edi-hub start
```

`build` gera `out`, sem instalador. `pnpm dev:edi` inicia o portal web, não este app. Os botões do Hub trabalham com releases assinados; para editar uma ferramenta localmente, execute o `dev` do workspace dela.

O catálogo único fica em `packages/config/src/edi-tools.ts`; sessão, licença, arquivos e atualização são responsabilidade de `@informach/edi-desktop`. O [padrão desktop](../../docs/arquitetura-desktop.md) define essas fronteiras. O [manual de distribuição](../../docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md) registra o fluxo de instaladores e publicação.
