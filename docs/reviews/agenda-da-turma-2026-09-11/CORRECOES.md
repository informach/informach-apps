# Correção dos achados da implementação

Concluída no workspace em 11/09/2026, horário de São Paulo. **Os dez achados F01–F10 da [revisão da implementação](REVISAO-IMPLEMENTACAO.md) foram corrigidos e verificados localmente.** Não houve implantação em produção. Este documento complementa a entrega anterior e preserva a revisão como registro dos defeitos encontrados.

## Resultado por achado

| Achado | Correção entregue | Verificação do comportamento |
| --- | --- | --- |
| F01 — edições consecutivas | A versão atual é obrigatória nos contratos e chega ao formulário pela lista e pelo calendário. Removido o envio implícito da versão 1. | Serviço aceita duas edições atuais e rejeita uma antiga. Navegador realizou quatro edições consecutivas, duas em cada tela, até a versão 5. |
| F02 — histórico privado | A autorização considera cada versão. Outras famílias recebem somente versões compartilhadas; o estado privado anterior à publicação é removido da resposta. A página identifica a publicação sem exibir uma comparação com conteúdo oculto. | Integração com várias versões privadas, publicação e correção pública; destinatário não recebe o segredo. Titular e convidado autorizado da família de origem conservam o histórico completo. |
| F03 — perda do histórico individual | A existência de estado de destinatários determina a preservação, mesmo após recusarem um aceite anterior. A exclusão do autor cancela a atividade nesses casos. | Aceitar, concluir, recusar e excluir pelo autor preserva a conclusão e o registro da atividade cancelada. |
| F04 — original fora do escopo | O original tem escopo explícito por criança, separado das ações. Enquanto desconhecido, só titular e remetente ainda autorizado podem acessá-lo. Compartilhar exige confirmar todas as crianças mencionadas; o convidado precisa ter acesso a todas. O escopo já declarado não pode ser estreitado silenciosamente. | Integração com original misto e PDF, inclusive criança mencionada sem ação; convidado restrito não lista nem obtém o original. Escopo de uma única criança e revisão do próprio envio continuam funcionando. Navegador confirma e persiste o escopo. |
| F05 — reutilização para outro filho | Extração continua em cache por conteúdo; aplicação passa a ser idempotente por recado e criança. A interface permite revisar a mesma extração para outro filho. A primeira data de confirmação permanece preservada. | Reutilização para B cria suas ações; repetições para A/B não duplicam. Navegador percorre a rota real de reimportação com resultado em cache, sem chamar IA novamente. |
| F06 — retificação entre recados | Prazos diferentes de possíveis obrigações correspondentes abrem uma escolha: atualizar a anterior ou manter separadas. Atualização confere versão, preserva identificador e conclusão, registra revisão e cancela entregas da versão antiga. | Integração cobre decisão obrigatória, versão desatualizada, conclusão preservada, lembrete substituído e decisão de manter duas obrigações. Navegador confirma uma correção para A sem alterar B. Reaplicar o recado antigo não restaura o prazo anterior. |
| F07 — lembrete perdido após interrupção | E-mail distingue adiamento (`sending`/`unknown`) de supressão definitiva. A rotina mantém a entrega recuperável sem esgotar tentativas enquanto aguarda resultado. `sent`/`delivered` não reenviam. Finalizações conferem a reserva vigente. | Integração com interrupção na terceira tentativa, várias consultas de resultado incerto e reconciliação para falha, envio e entrega. Recupera falha com um envio e não repete envio já confirmado. Suite compartilhada de e-mail também passou. |
| F08 — conclusão de tentativa antiga | Persistência e finalização exigem o identificador da execução e estado de processamento. Uma conclusão atrasada não altera a tentativa atual nem registra uma falha referente à execução nova. | Reserva expirada, nova execução e conclusão antiga controladas no PostgreSQL: antiga não grava resultado/status; nova conclui normalmente. |
| F09 — acesso restaurado após revogação | Seleção e remoção usam bloqueio da mesma turma. Seleção revalida perfil e participação dentro da transação. Consultas e escritas relevantes também exigem participação efetiva; turma ativa é uma preferência. | Integração controla a ordem da disputa e também executa remoção real concorrente com seleção. Sem participação, preferência antiga não permite ler, criar ou aceitar dados da turma. |
| F10 — publicação no original | A extração transporta data de publicação e trecho de evidência. Validador aceita referência fundamentada e impede prazo relativo quando ausente ou conflitante. Interface mostra a referência para conferência. Resultados antigos sem o campo continuam legíveis. | Regressões determinísticas cobrem referência válida, evidência inadequada e conflito. Avaliação no provedor calcula o prazo a partir do original sem preencher o campo separado. |

Os testes que afirmam os comportamentos corrigidos estão em [review-regressions.test.ts](../../../apps/agenda-da-turma/test/integration/review-regressions.test.ts), [extraction.test.ts](../../../apps/agenda-da-turma/src/features/notices/extraction.test.ts) e [review-fixes.spec.ts](../../../apps/agenda-da-turma/e2e/review-fixes.spec.ts). As reproduções antigas continuam arquivadas como evidência histórica e não foram convertidas em testes que aceitam o defeito.

## Validação final

| Verificação | Resultado |
| --- | --- |
| Testes do app | 482 passaram, em 36 arquivos. |
| Integração em PostgreSQL local | 33 passaram, incluindo 17 regressões desta revisão. |
| Pacotes compartilhados | 507 passaram: autenticação 216, billing 185 e e-mails 106. |
| Navegador móvel, Edge, 390 × 844 | Dois cenários completos passaram: correções e rotina familiar com dois adultos, revogação e exclusão confirmada. |
| IA com provedor real | 16/16 casos sintéticos passaram, com texto, imagem e PDF. |
| Tipos | App, banco, autenticação, billing e e-mails passaram. |
| Biome | 185 arquivos de código/configuração alterados ou novos, sem erros. Artefatos históricos e snapshots gerados de migração não foram reformatados. |
| Build otimizado | Compilação, TypeScript e geração das 50 páginas passaram. |
| Banco e limpeza | Migrações 0037/0038 registradas com os hashes dos arquivos; coluna, chaves estrangeiras e índice conferidos. Nenhum usuário ou customer das fixtures verificadas permaneceu. |

Os [relatórios de verificação e saídas dos comandos](evidence/correcoes-revisao/EVIDENCIAS.md) registram horários, resultados e limites. Os 1.022 testes de código/integração, 16 casos de IA e dois cenários de navegador são conjuntos separados.

Durante a validação, foram corrigidos um conflito de qualificação de coluna SQL, o contrato estrito do provedor para o novo campo e instruções ambíguas sobre materiais sem prazo. Os critérios dos casos de IA existentes foram preservados. Uma execução inicial de testes paralelos excedeu o tempo do teste de importação; a suite completa passou posteriormente sem alterar o timeout. No navegador, uma tentativa foi interrompida por reinício automático do servidor de desenvolvimento; a execução final passou, com zero retries configurados. O resultado do corpus é uma amostra de uma execução, não uma estimativa estatística de precisão.

## Implantação e limites

As migrações expansivas [0037](../../../packages/db/src/migrations/0037_agenda_review_fixes.sql) e [0038](../../../packages/db/src/migrations/0038_agenda_notice_applications_backfill.sql) foram aplicadas **somente ao banco local**. A primeira cria aplicações por criança e escopo do original; a segunda preenche aplicações de recados anteriormente confirmados. Originais antigos continuam privados até revisão explícita do escopo. Aplicar ambas antes do novo código no ambiente de destino, conforme [OPERACAO.md](OPERACAO.md).

O navegador foi validado em desenvolvimento com CSP ligada, e o build de produção foi gerado. Runtime de produção, migração em cópia da base de destino, Stripe real, recebimento real de e-mail/push e scheduler do ambiente ainda requerem homologação. Resultados incertos de envio dependem da reconciliação do provedor; eles não são autorização para reenviar cegamente.

Não houve uso de recados reais de crianças nesta validação. A revisão humana das extrações permanece necessária. Conectores automáticos do Teams/Batista ID, disposição a pagar e retenção de assinantes continuam fora do que estes testes demonstram.
