# Missão Saber — experiência de responsáveis e estudantes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Execução nesta sessão: implementação direta com verificações entre fases, usando as ferramentas disponíveis. Não depender de delegação ou de pacotes de skills ausentes para executar o trabalho autorizado.

**Goal:** entregar áreas distintas de acompanhamento e estudo, primeiro acesso orientado, sessões de estudante restritas, conexão revogável de aparelhos e percursos adequados à faixa escolar.

**Architecture:** manter os serviços pedagógicos e a conta compartilhada Informach. Adicionar credenciais de estudo opacas, com hash no PostgreSQL, e autorização explícita de perfil em cada leitura e ação. Separar layouts e páginas do responsável das páginas de estudo; reutilizar as fontes reais dos relatórios e da recomendação existentes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Better Auth 1.6.9, Drizzle/PostgreSQL, Tailwind 4, Vitest, Playwright.

**Spec:** `docs/propostas/missao-saber-experiencia-2026-10-03/proposta.md` e `diagnostico.md`.

**Concluído no workspace em 2026-10-03:** fases 1–6 verificadas. A rodada final aprovou 1.454 testes unitários do app, 219 de autenticação, 104 de integração e 68 de navegador, além de tipos, lint, formatação e build. A limpeza do servidor local do Playwright precisou ser concluída explicitamente no Windows; o comando terminou com código 0 e removeu o banco isolado. Resultados, capturas, migração e limitações estão em `implementacao-e-verificacao.md`. Publicação em produção, pesquisa com famílias e avaliação assistiva com participantes permanecem pendentes.

## Global Constraints

- Conteúdo elegível por ano escolar, do 2º ano ao ensino médio. Nenhum novo currículo nesta entrega.
- Não mudar critérios de evidência, respostas, pistas ou identificadores de atividades.
- Perfil selecionado por cookie não concede autorização; verificar a credencial e o perfil no servidor.
- A sessão de estudante não concede acesso à conta, cobrança, exportação, manutenção ou relatórios familiares.
- Preservar rascunhos e impedir escrita silenciosa em outro perfil após troca de contexto.
- Ações principais e tempos exibidos devem refletir dados reais; rotina familiar não é estimativa da missão.
- Nenhum e-mail obrigatório para criança, nenhuma comparação entre irmãos, nenhuma penalidade por ausência.
- Configurações sensíveis exigem confirmação recente do responsável.
- Preservar `.claude/settings.local.json` e alterações externas à tarefa.
- Migração aditiva gerada pelo script do projeto; não editar SQL gerado.
- Piloto com famílias e medição de efeitos exigem participação humana; registrar como validação externa pendente, sem simular resultados.

## 1. Sessão e acesso de estudante

**Files:** criar `src/features/study-access/{policy,repository,server,actions}.ts`, testes unitários e `test/study-access.integration.ts`; alterar `packages/db/src/schema/missao-saber.ts`, configuração de sessão em `packages/auth/src/index.ts`, `src/lib/{auth,action,view}.ts`; criar rotas de entrada/saída de estudo.

**Interfaces:**

```ts
type StudyIdentity = {
  deviceId: string;
  userId: string;
  profileIds: string[];
  profileId: string;
};
// repository: credencial bruta só existe na emissão; banco guarda hash.
// createStudyDevice(userId, { profileIds, label, remember }): credencial + dispositivo
// readStudyDevice(token): proprietário, perfis autorizados e validade ou null
// revokeStudyDevice(userId, deviceId): revogação pertencente à família
// server: requireStudyProfile(profileId) e requireStudySession(sessionId)
// devolvem StudyIdentity ou erro antes de chamar os serviços pedagógicos.
```

- [x] Adicionar tabelas de dispositivos, vínculos de perfis, códigos de conexão e limites de tentativa, com cascata para limpeza da família.
- [x] Gerar migração e revisar SQL, índices, chaves estrangeiras e ordem no journal.
- [x] Implementar emissão, validade, seleção apenas entre perfis autorizados e revogação imediata.
- [x] Permitir desabilitar cache de cookie da sessão Better Auth por aplicativo, mantendo o padrão dos outros apps; desabilitá-lo no Missão Saber para a revogação adulta surtir efeito imediatamente.
- [x] Entrada em estudo: validar origem e responsável, emitir credencial restrita, encerrar apenas a sessão adulta atual e transferir os cookies de saída produzidos pela biblioteca.
- [x] Aplicar guards em todas as ações de missão, pistas, notas, relatos, laboratórios, seleção de perfil e respectivas páginas.
- [x] Testar no banco real: token desconhecido/expirado/revogado, perfil de outra família, perfil irmão não autorizado, exclusão familiar e replay concorrente de código. Exemplo de contrato de segurança:

```ts
const access = await createStudyDevice(owner, {profileIds: [childA], label: "Tablet", remember: false});
expect((await readStudyDevice(access.token))?.profileIds).toEqual([childA]);
await revokeStudyDevice(owner, access.device.id);
expect(await readStudyDevice(access.token)).toBeNull();
```

**Verificação:** `pnpm --filter @informach/missao-saber test`, `pnpm --filter @informach/missao-saber test:integration`, typecheck do app e de auth/db. Conferir rotas de autenticação, não apenas ações de interface.

## 2. Entrada, layouts e preparação do perfil

**Files:** `src/components/{auth-form,navigation,profile-switcher,sign-out}.tsx`, `src/app/entrar/page.tsx`, layouts de responsável e estudante, novas páginas de preparação, escolha/entrada em estudo e confirmação da passagem; componentes em `src/features/family/components`.

**Consumes:** identidade de estudo e ações de entrada/saída da fase 1. **Produces:** destinos estáveis `/familia`, `/familia/estudantes`, `/familia/acompanhamento`, `/familia/conta`, `/estudar`, `/hoje`.

- [x] Separar os grupos de layout sem mudar os endereços já usados por estudantes.
- [x] Mostrar rótulos de papel e quatro destinos adequados em computador e celular.
- [x] Fazer o login conservar um destino interno permitido; não aceitar redirecionamento externo.
- [x] Implementar perfil em etapas: apelido/ano/consentimento, trilha sugerida explicada, confirmação “Tudo pronto”. Preservar dados ao voltar e em erros.
- [x] Permitir preparar primeiro perfil sem obrigar rotina, compra, avatar ou diagnóstico.
- [x] Abrir o estudo por ação explícita, com perfis autorizados e duração da conexão compreensíveis.
- [x] Atualizar testes de primeiro acesso para observar a passagem, e testar login de retorno e cancelamento de desbloqueio adulto.

**Verificação:** fluxo em Playwright com cadastro local, confirmação de e-mail, primeiro perfil, passagem para estudo, retorno adulto e nova autenticação. Em 390 px, nenhuma rolagem horizontal e ação principal encontrável.

## 3. Hoje, navegação e continuidade pedagógica

**Files:** páginas `hoje`, `jornada`, `revisao`, `simulados`, `meu-espaco`; `src/features/learning/components/player.tsx`, componentes de contexto; página e biblioteca do laboratório; apresentação por faixa em CSS e componentes.

**Consumes:** `currentDashboard()` restrito ao estudante e resultado do motor atual de recomendação. **Produces:** um estado inicial coerente, navegação consistente e encerramento diário explícito.

- [x] Primeiro estudo mostra orientação em vez de métricas vazias; diagnóstico fica como opção com propósito explicado.
- [x] Retomada, revisão e próxima missão mantêm a prioridade pedagógica existente e explicam a ação.
- [x] Trocar duração presumida por “Seu combinado”; atualizar chamada do laboratório conforme assunto atual.
- [x] Manter revisão, simulados e histórico acessíveis na trilha; preservar URLs antigas e ligações de contexto.
- [x] Conclusão oferece “Encerrar por hoje”, confirmação de salvamento real e continuidade opcional.
- [x] Adequar linguagem de revisão e apresentação às três faixas, sem retirar ajuda ou leitura de adolescentes.
- [x] Rever estados sem conteúdo elegível, gratuito, ausência de revisão, pausa e retorno após ausência.

**Verificação:** testes existentes do motor permanecem íntegros; E2E cobre pista, resposta, retomada, laboratório/caderno, término e troca de perfil.

## 4. Painel e acompanhamento do responsável

**Files:** extrair `familia/page.tsx` em componentes e consultas de acompanhamento; páginas de estudantes, acompanhamento e conta; adaptar links de resumo semanal e reautenticação.

**Consumes:** dados de perfil, histórico, evidência e orientações revisadas existentes. **Produces:** resumo por estudante e detalhes progressivos, sem nova regra de aprendizagem.

- [x] Página inicial tem orientação de preparação quando vazia e cartões concisos quando há estudantes.
- [x] Acompanhamento responde o que estuda, o que foi observado e como apoiar; tabelas ficam em detalhes.
- [x] Identificar sugestões iniciais como sugestões da trilha quando não há tentativas.
- [x] Mover assinatura, exportação, exclusão, dispositivos e preferências familiares para contextos próprios.
- [x] Explicar ao estudante a visibilidade de tentativas/reflexões sem prometer privacidade inexistente.
- [x] Testar zero, um e vários perfis, restrições de plano e confirmação recente sem perder o destino.

**Verificação:** comparação dos dados do relatório com a fonte existente, testes de autorização das páginas e navegação móvel.

## 5. Conexão de aparelhos e operação

**Files:** componentes e ações de acesso, `/estudar/conectar`, conta/dispositivos; documentação de privacidade quando necessário; registro de eventos operacionais com conteúdo mínimo.

**Interfaces:** código de conexão temporário, de uso único, limitado por tentativa; não enviar senha ou nome do estudante em URL pública. Token de estudo opaco e independente.

- [x] Responsável escolhe perfis e nome do aparelho, emite código e pode cancelá-lo.
- [x] Estudante informa o código, recebe sessão restrita e entra no contexto autorizado.
- [x] Consumo atômico impede duas conexões por replay; expiração e limite de tentativas têm mensagens recuperáveis.
- [x] Responsável lista e revoga aparelhos sem receber tokens ou códigos já consumidos.
- [x] Saída limpa rascunhos locais conforme as salvaguardas existentes e invalida acesso; troca para responsável preserva o trabalho confirmado.
- [x] Instrumentar somente etapas/IDs técnicos necessários, sem respostas abertas ou identificadores pessoais no payload de eventos. Documentar retenção, acesso e limites de inferência das métricas.

**Verificação:** duas sessões de navegador independentes, código incorreto/expirado/consumido, revogação enquanto estudante está conectado e prova de bloqueio das ações após revogação.

## 6. Revisão final e entrega

- [x] Revisar a proposta linha a linha e registrar correspondência de requisitos, diferenças justificadas e validações humanas pendentes.
- [x] Executar formatação/lint, testes unitários, integração isolada, E2E e build; corrigir achados antes de declarar a implementação concluída.
- [x] Conferir acessibilidade de fluxos principais, foco, teclado, contraste, leitura, alvos de toque e redução de movimento.
- [x] Documentar migração aditiva, rollout e recuperação; nenhuma alegação de resultados de piloto sem participantes reais.
- [x] Registrar comandos e evidências em `docs/propostas/missao-saber-experiencia-2026-10-03/implementacao-e-verificacao.md`.

## Fontes de integração consultadas

- Better Auth: https://better-auth.com/docs/concepts/session-management — revogação imediata requer revalidação, cache de cookie pode manter sessão antiga.
- Better Auth: https://better-auth.com/docs/integrations/next — integração de handlers e ações com Next.
- A versão instalada e os contratos do pacote `@informach/auth` são a referência de tipos da implementação.
