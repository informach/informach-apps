# Missão Saber — implementação e verificação da experiência da família

**Data:** 3 de outubro de 2026. **Escopo:** implementação no workspace, sem publicação em produção. Este registro complementa a [proposta](proposta.md) e o [plano de implementação](../../superpowers/plans/2026-10-03-missao-experiencia-familia.md). A validação com famílias continua pendente; nenhuma melhoria de conversão ou aprendizagem foi medida nesta entrega.

## Entrega

A [revisão posterior e suas correções](revisao-e-correcoes.md) registram os achados adicionais e a nova rodada de verificação solicitada após esta implementação.

A conta do responsável agora tem visão geral, estudantes, acompanhamento e conta em páginas distintas. O primeiro perfil é preparado em etapas; abrir o estudo exige uma passagem explícita para uma credencial restrita. Hoje orienta o primeiro estudo, conserva a recomendação pedagógica existente e oferece fechamento do dia. O responsável pode conectar e revogar outro aparelho por código temporário, escolhendo os estudantes permitidos.

As regras de recomendação, evidência de autonomia, pistas, respostas, elegibilidade escolar e os identificadores do catálogo permanecem nos serviços existentes. Os relatórios reutilizam essas fontes e as sugestões de apoio em casa já revisadas.

## Correspondência com a proposta

As seções 1–3 da proposta documentam diagnóstico e referências anteriores. Permanecem como linha de base qualitativa, sem reinterpretar suas telas como resultado de teste da implementação.

| Requisito da proposta | Implementação e evidência |
| --- | --- |
| §4: dois espaços reconhecíveis | Layouts `(parent)` e `(app)`, rótulos de papel e navegação própria. Entradas públicas identificadas para responsável e estudante. |
| §4: entrada conforme estado | Família vazia leva à preparação; responsável retorna à visão geral; credencial de estudo leva a Hoje; conexão ausente/expirada apresenta recuperação. |
| §4: quatro destinos e nomes concretos | Responsável: Visão geral, Estudantes, Acompanhamento, Conta. Estudante: Hoje, Minha trilha, Laboratório, Caderno. Revisar, Simulados, Minha atividade e Minhas preferências acessíveis pela trilha. |
| §4: links antigos e contexto | Endereços de estudo preservados; retorno de pagamento em `/familia?pagamento=...` encaminhado à Conta; e-mail semanal abre Acompanhamento; autenticação conserva somente destinos internos permitidos. |
| §5: preparação progressiva | Apelido, ano e consentimento; trilha elegível com explicação e alternativas; confirmação “Tudo pronto”. Rotina, nascimento, compra e diagnóstico não são obrigatórios. |
| §5: conservar escolhas | Rascunho de preparação por responsável em `sessionStorage`; voltar entre etapas e confirmar novamente a conta preservam escolhas. E2E específico. |
| §5: passagem explícita | Abertura identifica quem vai estudar, informa o papel de apoio do adulto e encerra a sessão adulta atual. Voltar à área adulta exige autenticação. |
| §5: primeiro estudo e diagnóstico | Orientação para tentar, pedir pista e conferir a ideia; contadores vazios substituídos. Diagnóstico opcional explica sua finalidade e usa o fluxo pedagógico existente. |
| §6: ação principal por estado | Retomada, revisão e próxima missão conservam a prioridade existente. Estados de ausência, conteúdo concluído e acesso gratuito continuam disponíveis. |
| §6: duração e laboratório | “Seu combinado” usa a rotina familiar sem se passar por estimativa. A chamada do laboratório aponta para experiência elegível associada à atividade atual; biblioteca e retorno à missão preservados. |
| §6: encerramento e verdade do salvamento | Conclusão oferece “Encerrar por hoje”; confirmação em Hoje exige sessão realmente concluída no dia local. Continuar estudando permanece possível; reflexão é opcional. |
| §6: continuidade | Caderno preserva rascunhos por estudante e atividade, inclusive edição; confirmação atrasada não apaga texto novo. Laboratório conserva tratamento existente de gravação pendente, conflitos e recuperação. |
| §7: visão geral resumida | Cartão por estudante, atividade recente ou orientação inicial, próximo assunto e acesso ao acompanhamento. Sem relatórios extensos na abertura. |
| §7: três perguntas do acompanhamento | O que aprende, o que foi observado e como apoiar. Evidências, tentativas, reflexões e laboratório abrem em detalhes. Sugestão anterior à primeira tentativa identificada como inicial. |
| §7: configurações em contexto | Perfis, rotina familiar e desafio em Estudantes; cobrança, exportação, exclusão, dispositivos e preferência do e-mail em Conta. Confirmação recente mantida nas operações sensíveis. |
| §7: compartilhamento e autonomia | Caderno explica a visibilidade de tentativas, reflexões e registros para o responsável. Sem comparação entre irmãos ou novo rastreamento de texto livre. |
| §8: três faixas escolares | Componentes compartilhados; anos iniciais conservam a apresentação lúdica; anos finais reduzem decoração; ensino médio usa tipografia mais sóbria e remove personagem/confetes. Revisão adapta linguagem. |
| §8: ajuda e acessibilidade | Leitura, ajuda, tema e redução de movimento continuam disponíveis. Testes medem contraste dos tokens claros/escuros, incluindo mensagens de erro dos novos formulários. |
| §9: autorização no servidor | Credencial opaca independente, vinculada a aparelhos e perfis. Páginas, ações de aprendizagem e laboratórios validam escopo; cookie de seleção não concede acesso. |
| §9: recuperar privilégios adultos | A passagem invalida a sessão adulta atual no Better Auth; seus cookies de saída são transferidos integralmente. O cache de cookie foi desabilitado somente no Missão Saber. |
| §9: código e aparelho compartilhado | Código de uso único, validade de dez minutos, consumo atômico, limite de tentativas, seleção explícita de perfis e revogação. Duas sessões independentes de navegador verificam o ciclo completo. |
| §9: outras aplicações Informach | A opção de cache do pacote compartilhado mantém o padrão dos demais aplicativos. Verificados contratos e testes do pacote de autenticação; não foi executado percurso completo de Cozya/Agenda em navegador. |
| §10: estados vazios e elegibilidade | Zero, um e vários perfis exercitados; trilhas filtradas por ano; oferta gratuita e limites existentes conservados. |
| §10: rede, pausa e troca | Mensagens não antecipam salvamento; falhas de conexão permitem tentar novamente. Troca de perfil verifica trabalho pendente e recarrega contexto; rascunhos não migram para outro estudante. Sem promessa de funcionamento offline completo. |
| §10: expiração e cancelamento | Credencial inválida/expirada orienta reconexão; retorno autorizado preservado. Cancelar autenticação adulta conserva o estudo em andamento. |
| §11: implementação por fases | Fases técnicas do plano concluídas com migração aditiva e verificação. Validação da direção com participantes e piloto de lançamento permanecem externos à implementação. |
| §12: métricas | Eventos mínimos de emissão, conexão e revogação adicionados ao audit; etapas de conta/perfil/atividade/tentativa continuam identificáveis nas fontes existentes. Não há medição de compreensão ou atribuição de efeito à interface. |
| §13: preservar capacidades pedagógicas | Nenhum novo currículo, ranking, regra de domínio, obrigação de diagnóstico ou rotina individual foi introduzido. |

### Decisões de escopo

- A conexão usa código digitável; QR era alternativa na proposta, não requisito adicional. Nenhuma senha do titular é compartilhada com o estudante.
- A sugestão de trilha parte do ano e do catálogo real; não foi criado um curso fictício de reforço geral nem um questionário obrigatório de interesses.
- As três faixas têm a mesma estrutura e ferramentas. Ajustes adicionais de nomes, autonomia e aparência dependem da pesquisa prevista.
- O e-mail semanal abre o acompanhamento com seleção de estudante. Não muda a frequência ou a adesão opcional existente.
- A instrumentação nova é de segurança de acesso. Cliques não são tratados como comprovação de compreensão e não foi criado um painel de métricas com resultados fictícios.

## Contrato de acesso e retenção

O token de estudo tem 32 bytes aleatórios e só seu hash fica no banco. Códigos usam dez caracteres sem símbolos ambíguos, são armazenados como HMAC e consumidos em transação com bloqueio da linha. A entrada exige origem igual à origem configurada do app e corpo limitado; o endpoint de conexão limita a dez tentativas por endereço em dez minutos, persistidas atomicamente por identificador HMAC. Não há token ou código em URLs de retorno.

A opção padrão não lembra o acesso: cookie de sessão e validade máxima de doze horas no servidor. “Lembrar” autoriza até trinta dias. Cada credencial concede somente os perfis escolhidos pelo responsável. Revogação é consultada em cada nova requisição; abas já abertas são bloqueadas na ação seguinte, mesmo antes de recarregar. Alteração de cookie para irmão não autorizado, requisição dirigida a outro perfil e replay de ação após revogação são exercitados pelos testes.

A troca de contexto notifica outras abas e recarrega a interface. Rascunhos locais de caderno são separados por perfil; sair da conta remove rascunhos de preparação e estudo conforme o fluxo de limpeza. Dados já confirmados permanecem no perfil correspondente. Armazenamento local indisponível é informado no caderno; não se promete persistência do rascunho nesse caso.

O job de manutenção existente chama a limpeza operacional: limites iniciados há mais de 24 horas, códigos cuja expiração ocorreu há mais de 24 horas e aparelhos expirados/revogados há mais de trinta dias. A exclusão da família remove os vínculos por cascata. Os eventos de segurança seguem a [política de audit](../../audit-payload-policy.md), retenção padrão de cinco anos e acesso restrito à operação autorizada. Seus payloads contêm IDs técnicos; excluem código, token, hash de credencial, endereço IP, apelido, nome do aparelho e respostas abertas.

## Verificação funcional e acessibilidade

A suíte de navegador cobre cadastro, confirmação local de e-mail, preparação, passagem para estudo, missão com pista/resposta, retomada, laboratório, caderno, reflexão, encerramento, retorno adulto, acompanhamento e troca de estudante. Inclui sessão antiga de responsável revogada, páginas administrativas/exportação negadas ao estudante, código incorreto/consumido, origem inválida e revogação de ação em sessão aberta.

O banco real isolado cobre também expiração, token desconhecido, irmão sem concessão, outra família, bloqueio do titular, consumo concorrente de código, limite concorrente de tentativas, exclusão familiar e limpeza que preserva conexões ativas. O ambiente de teste não envia mensagens nem cobra usuários reais. Famílias fictícias recebem endereços de teste distintos para não compartilhar acidentalmente o limitador de login; o limite da aplicação permanece ativo.

Foram revisados títulos, rótulos, ordem de leitura, foco visível, alvos principais de 44–48 px, alertas de erro e estados de salvamento. Teclado é exercitado na navegação e nos controles matemáticos. Há verificações em 320 px e nas três faixas em 390 × 844 px, sem rolagem horizontal nos percursos cobertos. Os testes de tema medem pares de texto/fundo em claro e escuro; preferências de redução de movimento existentes foram preservadas. Mensagens de erro novas usam `coral-solido`, após a medição identificar contraste insuficiente em `coral-fundo`.

Isso não constitui certificação WCAG. Uso prolongado com leitor de tela, ampliação real de texto/zoom em diferentes navegadores, dispositivos físicos e compreensão por participantes continuam na validação externa. A inspeção de semântica e os testes automatizados não substituem essas etapas.

### Evidências visuais

Capturas produzidas com dados fictícios pelos testes da implementação, em viewport de 390 × 844 px. O menu fixo aparece na posição da janela em capturas de página inteira.

- [Visão geral do responsável](evidencias/implementacao-responsavel.png).
- [Primeiro estudo — anos iniciais](evidencias/implementacao-anos-iniciais.png).
- [Primeiro estudo — anos finais](evidencias/implementacao-anos-finais.png).
- [Primeiro estudo — ensino médio](evidencias/implementacao-ensino-medio.png).

## Migração, publicação e recuperação

A migração gerada `packages/db/src/migrations/0068_flawless_purple_man.sql` adiciona `study_devices`, `study_device_profiles`, `study_codes` e `study_access_limits`, com índices e chaves estrangeiras. Não reescreve progresso pedagógico ou tabelas da conta compartilhada. SQL, snapshot e journal foram gerados juntos; uma nova execução do gerador confirmou ausência de diferenças de schema.

Sequência para a publicação, que **não foi executada nesta entrega**:

1. Confirmar o ambiente alvo, backup e procedimento de restauração vigente; usar o fluxo de release do repositório.
2. Aplicar as migrações com `pnpm --filter @informach/db db:migrate` no ambiente correto, antes de disponibilizar o novo build. Não usar `db:push` nem editar o SQL gerado.
3. Publicar o app mantendo as variáveis existentes, inclusive a origem correta em `NEXT_PUBLIC_APP_URL` e a estabilidade de `BETTER_AUTH_SECRET`. Não há uma nova variável obrigatória para o acesso de estudo.
4. Confirmar `/api/ready`, que verifica banco, cache e journal esperado; verificar o agendamento existente da manutenção.
5. Fazer um percurso controlado com uma conta de validação: preparar perfil, entrar em estudo, confirmar bloqueio adulto, conectar um segundo navegador, revogar e comprovar bloqueio de sua próxima ação; conferir um relatório e retorno de cobrança.
6. Conduzir o piloto acompanhado com famílias antes de ampliar divulgação. O código não inclui um sistema novo de distribuição percentual por família; uma exposição técnica por coorte exigiria trabalho específico.

Contas existentes conservam perfis e progresso. A sessão adulta existente continua adulta até a escolha explícita de abrir o estudo; ela não é promovida automaticamente a credencial de estudante. Links antigos de estudo passam pela entrada autorizada e conservam o destino permitido.

Em caso de incidente, revogar a conexão afetada e interromper novas conexões durante a correção. Reverter somente a apresentação exige manter a autorização restrita no servidor. Voltar integralmente a um build anterior a esta entrega restaura o modelo antigo de papéis e não deve ser tratado como rollback transparente de segurança. As tabelas aditivas podem permanecer no banco durante a recuperação; não apagar dados pedagógicos nem desfazer a migração por remoção de tabelas em produção.

## Resultados dos comandos

Verificações executadas em 03/10/2026, após a última alteração de código. O escopo é o aplicativo Missão Saber e os pacotes compartilhados alterados, auth e db; não representa uma execução de todas as aplicações do monorepo. A retomada final aprovou **1.845 testes**, além de tipos, formatação, lint e build. Logs locais: `.cache/family-resume-lint.log`, `.cache/family-resume-checks.utf8.log` e `.cache/family-resume-e2e.log`. O log original dos checks foi preservado; a cópia UTF-8 apenas normaliza a mistura de codificações produzida pelo PowerShell.

```text
VERIFICATION REPORT
-------------------
Claim: formatação e lint dos arquivos de código alterados
Command: pnpm exec biome check @checked
Executed: 2026-10-03, após a última alteração de código
Exit code: 0
Output summary: Checked 78 files in 189ms. No fixes applied.
Warnings: none
Errors: none
Verdict: PASS
```

`@checked` foi montado no PowerShell com `git diff --name-only --diff-filter=ACMR` e `git ls-files --others --exclude-standard`, filtrando arquivos `.ts`, `.tsx` e `.json` de `apps/missao-saber`, `packages/auth` e `packages/db`, exceto metadados gerados de migração. Arquivos excluídos não foram enviados ao formatter; o Biome também respeita as exclusões do projeto.

```text
VERIFICATION REPORT
-------------------
Claim: tipos do aplicativo e dos pacotes compartilhados alterados
Command: pnpm --filter @informach/missao-saber typecheck
         pnpm --filter @informach/auth typecheck
         pnpm --filter @informach/db typecheck
Executed: 2026-10-03, após a última alteração de código
Exit code: 0 para cada comando
Output summary: tsc --noEmit; EXIT: 0 em cada etapa
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte unitária completa do Missão Saber, incluindo contraste e política de acesso
Command: pnpm --filter @informach/missao-saber run test --maxWorkers=2 --minWorkers=1
Executed: 2026-10-03, após a última alteração de código
Exit code: 0
Output summary: Test Files 37 passed (37); Tests 1454 passed (1454)
                src/app/tema.test.ts (59 tests)
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte completa do pacote de autenticação
Command: pnpm --filter @informach/auth run test --maxWorkers=2 --minWorkers=1
Executed: 2026-10-03, após a última alteração de código
Exit code: 0
Output summary: Test Files 9 passed (9); Tests 219 passed (219)
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: migração gerada corresponde ao schema atual
Command: pnpm --filter @informach/db db:generate
Executed: 2026-10-03, após a última alteração de schema
Exit code: 0
Output summary: No schema changes, nothing to migrate
Warnings: none
Errors: none
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: suíte completa de integração em PostgreSQL local descartável
Command: pnpm --filter @informach/missao-saber test:integration
Executed: 2026-10-03, na retomada final após a última alteração de código
Exit code: 0
Output summary: Test Files 25 passed (25); Tests 104 passed (104)
                Duration 135.20s; banco isolado removido ao terminar
Warnings: avisos de migrações existentes sobre extensões já instaladas
          e truncamento de nome de constraint de outro módulo
Errors: nenhum teste falhou; cenários de falha de transporte emitem logs esperados
Verdict: PASS
```

```text
VERIFICATION REPORT
-------------------
Claim: build de produção e suíte completa de navegador em computador e celular
Command: pnpm --filter @informach/missao-saber e2e
Executed: 2026-10-03, na retomada final após a última alteração de código
Exit code: 0
Output summary: Compiled successfully in 22.8s
                Finished TypeScript in 22.5s
                Generating static pages (13/13)
                68 passed (10.3m); banco isolado removido ao terminar
Warnings: avisos de migração existentes e conflito NO_COLOR/FORCE_COLOR;
          encerramento do servidor local concluído explicitamente no Windows
Errors: nenhum erro de build ou teste
Verdict: PASS
```

A execução do E2E usou `NODE_OPTIONS=--max-old-space-size=4096` e `RAYON_NUM_THREADS=2` somente no processo de verificação. Depois dos 68 testes aprovados, o Playwright ficou aguardando o encerramento de seu servidor no ambiente gerenciado do Windows. O código instalado usa `taskkill` para essa limpeza; o processo do servidor permanecia ativo. Foi encerrado somente o Node deste servidor isolado, após conferir PID e instante de criação. O runner então concluiu normalmente com código 0 e removeu seu banco temporário. O tempo de 10,3 minutos inclui essa espera; nenhum teste, timeout, asserção ou código da aplicação foi alterado para encerrar a rodada.

Uma tentativa de verificação simultânea foi interrompida por `VirtualAlloc failed`/`spawn UNKNOWN` no Windows. A rodada foi repetida em sequência, limitando os processos das suítes unitárias; nenhum teste foi removido. A tentativa inicial de passar os limites pelo atalho `pnpm test` foi rejeitada pelo CLI antes de executar testes; os comandos registrados acima usam `pnpm run test`, que encaminha os argumentos ao Vitest. Os erros de execução anteriores permanecem no log para rastreabilidade.

## Validação externa pendente

- Pesquisa de localização e compreensão com responsáveis e estudantes das três faixas, conforme §12 da proposta.
- Avaliação assistiva com leitor de tela, zoom/ampliação e aparelhos físicos.
- Publicação, percurso controlado em produção e exposição gradual conforme o procedimento de release.
- Linha de base e acompanhamento das métricas; nenhum resultado causal de aprendizagem foi alegado.

As alterações preexistentes em `.claude/settings.local.json` foram preservadas. Não foi feito commit, push ou deploy nesta retomada.
