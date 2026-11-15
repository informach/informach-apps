# Revisão Compasso e limpeza — 14/11/2026

Esta revisão acompanha o corte e a limpeza de diagnósticos. Os resultados locais
abaixo não comprovam, por si, implantação nem homologação em produção.

## Achados e tratamento

- **CSP da Agenda e Cozya:** eventos de violação apontaram para a tentativa de
  compilação dinâmica do Zod no navegador. Os dois apps configuram `jitless`
  antes das validações, conservando a política CSP. Os testes verificam uma
  validação válida e uma inválida com `Function` bloqueada, e incluem controle
  que demonstra a tentativa sem a configuração. A publicação e a observação
  posterior dos alertas ainda devem ser verificadas.
- **Webhooks de outros produtos:** assinaturas e faturas de outros apps chegam
  aos endpoints da mesma conta Stripe. A origem é conferida pelo customer único
  do banco, e o recibo é conservado. Customers desconhecidos seguem a conciliação;
  preço ou metadados isolados não comprovam origem.
- **Pagamento recorrente sem metadados:** o evento histórico examinado no Stripe
  correspondia a uma fatura recorrente paga. O handler só o classifica como tal
  após confirmar no provedor o mesmo customer, estado pago, motivo de assinatura
  e lista completa apenas com itens de assinatura. Metadados parciais, faturas
  mistas e fatos não confirmados continuam sinalizados; uma consulta falha ou
  pagamento ainda não confirmado deixam o recibo pendente. O cron central retoma
  somente essa classe de falha, pelo dispatcher original e no escopo do evento;
  uma fatura inconclusiva não impede a tentativa da próxima.
- **Limites no teste de navegador:** a borda isolada representa origens de
  visitantes nas tentativas de senha; trocas de token sempre usam o endereço
  compartilhado do servidor. O teste da borda confere os dois comportamentos e
  a liberação de recursos sem interferir em uma porta ocupada. A suíte própria
  de autenticação também exercita o teto de tokens e o limite independente de
  senha com armazenamento transacional.
- **Teclado no Bora Treinar:** eventos `keydown` de dispositivos ou testes
  podem chegar sem `key`; o manipulador preserva o código de voltar dos
  controles e não assume que a propriedade existe. O teste cobre um evento
  sem `key`, o código de voltar de TV e Escape.
- **Alertas históricos de autenticação:** `COZYA-J` e `AGENDA-DA-TURMA-J`
  registram nível e aplicativo, sem detalhes suficientes para determinar a
  causa. Não foram apagados nem classificados como resolvidos.
- **Produto externo na mesma conta Stripe:** os eventos históricos
  `AGENDA-DA-TURMA-6` e `COZYA-6` referem-se a uma assinatura ativa do produto
  Comunidade Sistema Zero; seu customer não tem cadastro em `billing.customers`.
  O dispatcher mantém clientes desconhecidos em conferência. Não usar o nome
  comercial, que pode mudar, como autorização para descartar eventos futuros.
- **Alerta de teste:** `CONTA-2` era uma única ocorrência explícita de
  homologação do Sentry e foi encerrada, conforme pedido da titular.
- **Incidentes operacionais anteriores ao corte:** foram encerrados os alertas
  de prontidão do Bora Treinar e Missão Saber, cujos endpoints atuais responderam
  HTTP 200, do job de lembretes
  do Bora, cuja execução atual foi bem-sucedida, e dos jobs financeiros antigos,
  substituídos pelo cron central já executado. Novas ocorrências podem reabri-los.
- **Escopo operacional:** os sete crons financeiros legados foram retirados no
  corte. Os dois jobs apontados pela titular tiveram última execução bem-sucedida
  e nenhum alerta ou falha no período consultado. O cron do Recreio está apenas
  provisionado para lançamento futuro, sem implantação ou execução.
  O Railway também lista desde maio uma remoção antiga em `REMOVING` do cron
  global de supressões; o deployment atual desse serviço está `SUCCESS`. A
  operação antiga não é uma mudança preparada e seu encerramento no provedor
  não foi comprovado.

Os seis endpoints de prontidão da Conta e dos consumidores Compasso retornaram
HTTP 200 na revisão. O Stripe confirmou uma programação única mensal para a
titular, ainda não iniciada e posterior ao período pago. Os históricos e a
evidência do corte estão no levantamento da Conta.
Os workflows CI, Compasso, Edi native e Edi database do commit de produção
`8602e402` constavam concluídos com sucesso na consulta ao GitHub; isso não
valida as alterações locais desta revisão.
Na leitura de produção, Helena e Julio eram os dois administradores da mesma
família; André, Débora, Leninha e Lipe eram os quatro dependentes ativos, e a
conta comercial tinha Helena como pagante.

## Verificação e publicação

- `pnpm compasso:test:integration --auth-only`: 34 testes passaram, inclusive
  o limite comum de tokens e o limite independente de senha.
- `pnpm compasso:test:integration --billing-only`: 141 testes passaram em banco
  descartável, incluindo falha e retentativa da consulta da fatura. Uma execução
  anterior, simultânea ao build, excedeu o limite de cinco segundos em um teste;
  a repetição isolada concluiu sem falhas.
- Após acrescentar a verificação das linhas da fatura, os 253 testes unitários
  de billing passaram. A integração financeira será repetida com essa versão.
- `pnpm --filter @informach/agenda-da-turma e2e`: 54 testes passaram; a rodada
  com a borda isolada não apresentou 429 nem os avisos anteriores de descoberta
  e variáveis de cor.
- `pnpm --filter @informach/cozya e2e`: 22 testes passaram, incluindo o formulário
  de receita sob CSP no computador e celular, sem os avisos anteriores. As
  mensagens de acesso negado nos logs são das tentativas intencionais de usar
  endpoints de conta desativados na matriz de segurança.
- A integração do Cozya concluiu 62 testes e registrou falhas de IA provocadas
  pelos cenários negativos em `env=test`; não são eventos de produção.
- `pnpm compasso:test:infrastructure`: quatro testes passaram, incluindo a
  separação dos limites e a liberação da porta do emissor isolado.
- `pnpm --filter @informach/bora-treinar exec vitest run src/features/treino/focus-nav.test.ts`:
  o teste de evento sem `key`, volta de TV e Escape passou.
- EdiSVG: 154 testes de interface e exportação passaram, assim como o teste de
  build e hidratação do consumidor Next. O EdiFoto passou nos testes de navegador.
- A matriz de navegador do Missão Saber terminou com 83 testes aprovados; um
  cenário de sala de competição foi omitido no celular por ser destinado a
  tablet e TV, conforme a própria especificação do teste.
- As jornadas de navegador do Bora Treinar e do Dia de Estrela concluíram com
  10 e 9 testes aprovados, respectivamente. A bateria do Recreio foi
  interrompida a pedido da titular por sobrecarga da máquina; três dos cinco
  cenários haviam passado. A verificação completa deve ocorrer no GitHub CI.
- Uma nova execução financeira simultânea ao build excedeu o limite de tempo de
  um teste; é necessário repetir a suíte completa no CI sem atribuir essa
  execução a uma falha funcional confirmada.
- No PR de revisão, os workflows Compasso, CI e Edi passaram no GitHub. A
  primeira execução do CI encontrou uma expectativa antiga sobre o ID da
  chave de teste do Recreio; ela foi corrigida e a repetição passou, incluindo
  os cinco cenários de navegador do Recreio e os builds.
- O exame dos logs encontrou builds descartáveis tentando criar releases no
  Sentry sem credenciais, ações GitHub com runtime desatualizado e PostgreSQL
  de teste inicializado com autenticação local `trust`. A configuração passou
  a distinguir builds descartáveis, atualizar as ações e exigir autenticação
  no banco de teste. Essas alterações aguardam nova rodada do CI. Os testes de
  rejeição intencional continuam exercitando e registrando os erros esperados.
- O primeiro ajuste do Sentry não bastou: o hook pós-compilação ainda tentava
  criar uma release. Nos builds descartáveis, esse hook também fica desativado;
  a instrumentação da aplicação e o comportamento de produção são preservados.
- O Redis de CI recebe configuração explícita e o parâmetro de memória
  recomendado no runner descartável; o container é encerrado ao final do job.
  Isso não altera o Redis nem as configurações do Railway de produção.

Os resultados finais dos gates gerais e da implantação devem ser acrescentados
após terminarem. Alertas dependentes dessas correções ficam abertos até a
publicação e a conferência do serviço atualizado.
