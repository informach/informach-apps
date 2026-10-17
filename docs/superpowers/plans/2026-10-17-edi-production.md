# Edi production Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in this session, with verification between tasks. The optional superpowers execution skills are not installed; the repository runbooks and the verification gates below govern execution.

**Goal:** Corrigir os bloqueios de entrega e operar o portal, as licenças e a distribuição Windows do Edi com evidências reproduzíveis.

**Architecture:** Preservar o monorepo, o PostgreSQL compartilhado e o Railway existente. O portal mantém identidade, cobrança e emissão de licença; o SDK desktop mantém sessão, integridade e atualização; GitHub Releases distribui somente os seis instaladores e o manifesto assinado.

**Tech Stack:** Node 24.15.0, pnpm 9.15.0, Next.js, Electron, Better Auth, Stripe 22.1.0/API 2026-04-22.dahlia, PostgreSQL/Drizzle, Railway e GitHub Actions.

**Spec:** `docs/propostas/edi-suite-2026-10-16/implementacao.md`, `correcoes.md`, `distribuicao-piloto.md` e `apps/edi/PRODUCAO.md`.

## Global Constraints

- Pedido de 17/10/2026 autoriza corrigir os bloqueios e colocar o Edi Hub em produção, incluindo integração Git e publicação necessárias após os gates. Não dispensou a homologação comercial ou a correção de R01.
- Preservar `.claude/settings.local.json` e os registros documentais preexistentes; não alterar preços/regras dos outros produtos.
- Uma assinatura: R$ 49,90/mês ou R$ 499/ano, aprovado pelo titular em 17/10/2026; IA paga separada; operação por CNPJ.
- Distribuição piloto Ed25519/GitHub, sem contratação Authenticode/CDN e sem desabilitar proteções Windows.
- Não reescrever migrations aplicadas, não usar `db:push`, não ocultar advisories, não imprimir segredos.
- Fixtures, contas e bases de homologação isoladas; não instalar testes nos perfis reais dos editores.

## 1. Dependências reproduzíveis e CI

Files: `package.json`, `pnpm-lock.yaml`, manifests dos consumidores afetados, `packages/ai-core/src/__tests__/dependency-exposure.test.ts`, `.github/workflows/ci.yml`.

- [x] Executar `pnpm install --frozen-lockfile` e reproduzir `pnpm --filter @informach/cozya typecheck`.
- [x] Conferir a resolução de `@hookform/resolvers`/Zod e corrigir o contrato de dependência para Zod 3 e 4, preservando schemas e formulários existentes.
- [x] Substituir a cadeia vulnerável de front matter por dependência mantida/compatível ou correção upstream validada; comparar parse, stringify, YAML seguro e o uso real pelo Mastra.
- [x] Executar `pnpm audit --prod`, tipos e testes dos consumidores afetados; o resultado exigido do audit é exit 0 sem ignores.

## 2. Contratos de versão e trabalhos em andamento

Files: `packages/edi-contracts/src/index.ts`, `packages/edi-desktop/src/controller.ts`, `packages/edi-desktop/src/main.ts`, `packages/edi-licensing/src/service.ts`, composição/configuração em `apps/edi`, testes adjacentes.

- [x] Implementar política explícita de versão mínima com dados validados e `update_required`, mantendo recuperação e atualização disponíveis.
- [x] Uniformizar a transição de licença para jobs já iniciados, preservando salvamento/recuperação e bloqueando novos trabalhos.
- [x] Verificar expiração, revogação, retomada e cliente antigo nos testes de contrato, serviço e runner Electron.

## 3. Homologação e instalação Windows

Files: `scripts/edi/installer-smoke.ps1`, `scripts/edi/release.mts`, `.github/workflows/edi-release.yml`, `.github/workflows/edi-native.yml`, fixtures dos cinco editores, recursos de ícones e notices.

- [x] Adicionar instalação A→B em runner Windows isolado, com sentinelas de projeto/perfil, app aberto e recuperação após falha. Execução remota ainda pendente.
- [ ] Validar o caminho updater→NSIS e rejeição de bytes/manifestos alterados.
- [x] Revisar conteúdo distribuído e identidades visuais sem modificar o layout dos editores.
- [ ] Executar `pnpm edi:test:native` e `pnpm edi:test:package --installer`; exigir também evidência remota de instalação/upgrade.

## 4. Chaves e credenciais de distribuição

Files: `scripts/edi/setup-github.mjs`, tooling de backup/restore, `docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md`.

- [x] Localizar e verificar o backup original sem imprimir material privado; se indisponível, registrar o estado antes de provisionar qualquer substituição.
- [x] Preparar backup cifrado portátil, guardar material de recuperação separadamente e verificar restauração em processo independente com assinatura e chave pública. Isso não comprova cópia fora deste equipamento.
- [ ] Conferir o ambiente `edi-release`, a correspondência das chaves desktop/backend e a credencial restrita ao repositório público.
- [ ] Remover a cópia redundante do secret de distribuição somente após confirmar a cópia operacional no ambiente privado.

## 5. Stripe, login e emissão de licença

Files: `apps/edi/src/features/billing`, `apps/edi/src/features/desktop`, scripts de provisionamento/homologação Edi e respectivos runbooks.

- [x] Conferir acesso Stripe de teste/produção por leitura segura das credenciais existentes.
- [x] Provisionar de forma idempotente produto, preços e Portal exclusivos Edi, sem alterar os outros apps. Imagem pública ainda depende do deploy.
- [x] Validar em Stripe de teste compra, renovação, inadimplência, cancelamento, reembolso, disputa, replay e eventos fora de ordem através do adapter real.
- [ ] Validar cadastro/OTP, device flow, limite de dispositivos, emissão/renovação/revogação de licença e entrega efetiva de e-mail.

## 6. Railway, DNS e operação

Files: `.railway/railway.ts`, `apps/edi/PRODUCAO.md`, `.env.example`, configuração dos jobs Edi e monitoramento. A API rejeitou o Config Path TOML legado; a adoção IaC limita-se ao Edi.

- [ ] Conferir o migrator e aplicar as migrations pelo fluxo compartilhado após revisão e testes.
- [x] Criar serviço Edi separado no projeto existente, configurar referências e segredos, pre-deploy OAuth e standalone.
- [ ] Configurar `edi.informach.com.br`, HTTPS e checar `/api/health` e `/api/ready` com o commit esperado.
- [ ] Agendar reconciliação autenticada, confirmar processamento de e-mail e configurar alertas de falha.
- [ ] Habilitar cobrança somente após a homologação; conferir as configurações live sem efetuar compra real.

## 7. Gates e publicação

- [x] Entregar o guia prático de desenvolvimento do Hub/ferramentas solicitado em 17/10, com comandos conferidos e links nas referências permanentes.
- [x] Executar `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --prod`, integração PostgreSQL/portal e verificações Windows locais proporcionais às alterações. Os gates remotos permanecem separados.
- [ ] Executar integrações/E2E dos consumidores web afetados e verificar CI remoto do commit final.
- [ ] Revisar diff, documentação, exposição de segredos e artefatos; integrar em `main` sem incluir alterações pessoais.
- [ ] Publicar via tag `edi-v*` e workflow oficial; verificar os seis instaladores, manifesto, digests e download público.
- [ ] Verificar Hub instalado com portal real e manter evidências de compra/licença em ambiente isolado.
- [ ] Atualizar `docs/estado-do-repositorio.md`, registro de implementação e runbooks com resultados reais e pendências, sem equiparar código a homologação.
