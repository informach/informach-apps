# Créditos de IA do Compasso

Política aprovada explicitamente pelo titular em 09/11/2026: 200 créditos por mês, sem acumular; 20 no teste de 14 dias; recargas sem vencimento de 100/R$ 14,90, 300/R$ 39,90 e 1.000/R$ 99,90. A franquia anual também é mensal, não uma concessão antecipada de 2.400. Usar primeiro a parcela que vence antes. Cancelamento não apaga compras; o uso de IA com recarga continua sujeito às permissões do app e não desbloqueia outros recursos pagos.

## Base da recomendação

Não houve acesso a faturas, métricas de consumo real ou condições tributárias. Estes são cenários de engenharia, não margem líquida comprovada. Preços consultados em 09/11/2026:

| Modelo em uso no código | Entrada por milhão de tokens | Saída por milhão de tokens |
| --- | ---: | ---: |
| [GPT-4o-mini, OpenRouter](https://openrouter.ai/openai/gpt-4o-mini/providers) | US$ 0,15 | US$ 0,60 |
| [GPT-4o, OpenRouter](https://openrouter.ai/openai/gpt-4o) | US$ 2,50 | US$ 10,00 |

[GPT-4o Transcribe](https://developers.openai.com/api/docs/pricing?latest-pricing-expanded=true): estimativa publicada de US$ 0,006/minuto. O gateway e os modelos alternativos precisam ter seu preço efetivo conferido antes da ativação. Não usar a tarifa de um modelo para custear outro.

Para planejar, usar **R$ 6 por dólar** como cenário conservador escolhido, não cotação atual, e 30% de provisão adicional para variações. Orçamento de custo por crédito: R$ 0,05. A fórmula de referência é `ceil(custoUSD × 6 × 1,30 / 0,05)`, mínimo de um crédito por operação concluída. Não representa conversão monetária, saldo sacável nem promessa de uma chamada por crédito.

| Cenário ilustrativo de uma execução | Custo provisionado | Créditos de referência |
| --- | ---: | ---: |
| Texto mini: 4.000 tokens de entrada e 2.000 de saída | R$ 0,01404 | 1 |
| Visão 4o: 4.000 tokens de entrada, incluindo imagem, e 2.000 de saída | R$ 0,234 | 5 |
| Áudio: um minuto de transcrição | R$ 0,0468 | 1 |

Esses exemplos não certificam o tamanho de uma foto nem o custo de um fluxo com múltiplos passos. Imagens, pesquisa de receitas, refinamento, retries e modelos alternativos exigem limite total e orçamento do fluxo inteiro. Falha não gera débito ao usuário, mas pode gerar custo do provedor: limitar tentativas e monitorar essa diferença. Mostrar a cotação máxima antes de começar, reservar esse máximo e nunca debitar acima do valor aceito. O servidor deve impor limites de entrada, saída e tentativas correspondentes à cotação; o cálculo isolado não é um controle de custo.

## Envelope econômico

- 200 créditos representam até R$ 10 de custo provisionado: 20,04% da mensalidade de R$ 49,90 e 24,05% da receita mensal equivalente do anual de R$ 499. Restam respectivamente R$ 39,90 e R$ 31,58 antes de impostos, Stripe, infraestrutura, suporte, inadimplência e outros custos.
- O teste representa até R$ 1 de custo provisionado. Uma concessão por elegibilidade, protegida contra repetição de conta e família.
- Recargas de 100, 300 e 1.000 reservam até R$ 5, R$ 15 e R$ 50 de custo provisionado. Diferenças sobre preço: R$ 9,90, R$ 24,90 e R$ 49,90, ainda antes dos demais custos.
- Não prometer volume de fotos a partir do número de créditos. Mudanças de modelos ou capacidades exigem nova tabela de operações, sem reduzir retroativamente o saldo comprado.

## Transição e operação

Créditos antigos compravam chamadas em tabelas específicas por app. Somar números sem conversão reduziria poder de uso. A migração deverá registrar origem, saldo, validade, versão de conversão e equivalência conservadora para os recursos anteriores, com conferência antes/depois. Reservas em andamento precisam terminar ou ser liberadas antes da transferência. Não alterar assinaturas Stripe antigas automaticamente nem renovar franquia duas vezes ao trocar de contrato.

O catálogo guarda apenas os valores aprovados; IDs de preços Stripe permanecem vazios até provisionamento verificado. Métricas por execução devem registrar app, recurso, modelo efetivo, tokens/duração, custo e `runId`, sem conteúdo pessoal. Revisar projeção após observar consumo real; nenhuma economia ou margem está homologada por este documento.

## Limites implementados na Agenda (10/11/2026)

O catálogo público do [GPT-4o no OpenRouter](https://openrouter.ai/api/v1/models) foi conferido novamente: entrada de texto/imagem/arquivo e US$ 2,50/10 por milhão. Os parsers mantêm os modelos existentes; fixam o provedor OpenAI, sem fallback, com preço máximo de entrada/saída. PDFs usam explicitamente o engine `native` do [file-parser](https://openrouter.ai/docs/guides/overview/multimodal/pdfs), sem fallback para OCR pago. O áudio mantém GPT-4o Transcribe, com duração calculada pelo servidor sobre PCM16 mono/16 kHz, até 120 segundos; o navegador converte antes do envio. Nenhuma chamada real paga foi executada para esta verificação.

A cotação é um **teto reservado**, não preço fixo nem quantidade prometida de leituras: nos parsers, cobra-se o consumo validado da resposta e libera-se a diferença. A versão da tarifa e o teto aceito vão no pedido e na reserva. Sem aceite compatível, não há chamada. Texto considera o limite conservador em bytes UTF-8; instruções/schema/contexto têm envelope verificado de 20.000 bytes, imagem até 3.000 tokens e saída até 4.096 tokens. PDF tem teto conservador do contexto inteiro do modelo (128.000 tokens), já que tamanho do arquivo não comprova quantidade de tokens. Isso exige saldo maior para PDF: não anunciar que os 20 créditos de teste cobrem qualquer arquivo. A cotação concreta é exibida no botão antes de enviar; não há cobrança acima dela.

Ditado reserva até dois créditos por envio e cobra um crédito por minuto iniciado, medido no PCM pelo servidor. É uma tarifa por duração, não uma promessa de equivalência exata ao custo do provedor. A [API STT](https://openrouter.ai/docs/guides/overview/multimodal/stt) não aplica pinagem nem os controles de preço de chat; campos sem efeito foram retirados. `usage.cost` e tokens efetivos são registrados, sem texto, com indicador de ausência de medição e de custo acima da provisão. A variação é absorvida pelo Compasso, nunca debitada além do aceite. O limite de 120 segundos, uma tentativa e prazo de 45 segundos reduzem exposição, mas não constituem teto financeiro imposto ao provedor; conferência dos custos reais e orçamento no gateway são gates operacionais antes da ativação. Organizar matérias ditadas é uma segunda operação, com teto de dois créditos, anunciada antes de gravar. A interpretação posterior de um recado é acionada separadamente. Resultado sem atividades/matérias e erros liberam a respectiva reserva; uma transcrição concluída continua sendo uma etapa cobrada se a interpretação posterior falhar.

Mastra 1.78.0 introduz processadores de recuperação com repetição própria. Além de `maxRetries: 0`, os agentes desativam `errorProcessorDefaults` e limitam `maxProcessorRetries` a zero. Testes usando os adaptadores instalados e HTTP sintético confirmaram uma tentativa em falha de provedor. `maxSteps: 1`, teto de saída e prazo de execução limitam cada chamada. Logs do framework e memória de conversa ficam desativados; telemetria não guarda trechos de áudio/transcrição. A contagem antiga de cinco leituras e suas concessões locais foram removidas.

O saldo é da família selecionada. A reserva relê `read`, `write` e `use_ai` para a pessoa/ativação e verifica cobertura no mesmo commit; a retirada de acesso depois de preparar o cliente impede a chamada. A confirmação/liberação só resolve reservas daquele adulto e família e pode encerrar chamadas autorizadas antes de uma revogação. Recados preservam saída antes do débito e recuperam execução confirmada sem nova cobrança. O corte financeiro, a conversão dos saldos antigos e os demais consumidores continuam pendentes; estas alterações ainda não operam em produção.


## Revisão da conversão do Cozya (10/11/2026, em implementação)

O consumidor ainda precisava trocar os débitos locais por Compasso. A inspeção encontrou fallback silencioso de mini para 4o e de 4o para Sonnet, incompatível com uma cotação calculada apenas pelo modelo principal. `src/ai/provider-policy.ts` passou a manter o modelo e limitar o preço de seus endpoints; execução, avaliações e pesquisa usam a mesma configuração. Falha de disponibilidade não autoriza um modelo mais caro. Suporte de `provider.max_price` conferido nos tipos instalados de `@openrouter/ai-sdk-provider` 2.9.0 e na [documentação oficial de roteamento](https://openrouter.ai/docs/guides/routing/provider-selection).

Referências conferidas: [4o](https://openrouter.ai/openai/gpt-4o), US$ 2,50/10 por milhão de tokens; [mini](https://openrouter.ai/openai/gpt-4o-mini/providers), US$ 0,15/0,60; [Transcribe no gateway](https://openrouter.ai/openai/gpt-4o-transcribe), cobrança por tokens, sem tratar duração como custo USD observado. A tarifa de duração precisa continuar distinguida do custo informado pelo provedor.

Na [busca web do OpenRouter](https://openrouter.ai/docs/guides/features/server-tools/web-search), Exa Instant/Fast/Auto custa US$ 0,007 por consulta até dez resultados. O SDK instalado só expõe `engine`, `maxResults` e `searchPrompt` na fábrica da ferramenta; o código já impõe `max_tool_calls: 1`. O orçamento deve cobrir o contexto máximo das etapas de pesquisa e extração, e não supor que cinco resultados tenham tamanho fixo. Os valores de Firecrawl não são os de Exa.

Obrigatório concluir antes do corte: cotação versionada por entrada/fluxo completo; aceite contendo a família mostrada; PCM limitado com `@informach/ai-core/speech-audio`; chave idempotente vinculada a usuário/família/conteúdo; recibo compartilhado que guarda saída antes do débito; prévias pessoais com autorização atual; retenção/exclusão coordenada; saldo e recarga centrais. A recarga preservada deve poder ser usada após cancelar a renovação, dentro das permissões gratuitas; não exigir assinatura para gastar um saldo comprado nem liberar planejamento pago por causa da recarga. Os testes de erro/retentativa precisam comprovar uma única chamada/débito e recuperação após falha de confirmação.

## Tarifa compartilhada do Cozya implementada (10/11/2026)

`features/ai/costs.ts` versiona o teto aceito em `2026-11-10-v1`. As etapas completas usam uma reserva; saída validada e recibo persistido precedem a confirmação. Falha de transporte recupera o resultado pago sem outra chamada. Recargas permanecem utilizáveis sem assinatura ativa; planejamento e limites pessoais são verificados separadamente.

| Tarefa | Reserva máxima |
| --- | ---: |
| Extrair texto / organizar receita ditada | 2 créditos |
| Adaptar receita | 3 créditos |
| Pesquisar e extrair receita com fonte | 6 créditos |
| Extrair foto | 15 créditos |
| Áudio com extração | 4 créditos |
| Áudio com pesquisa | 8 créditos |
| Transcrição avulsa | 2 créditos |

A tarifa por tokens usa os preços publicados do modelo, câmbio de orçamento de R$ 6/US$, fator 1,3 e unidade de R$ 0,05, arredondada para cima com mínimo de um crédito. Pesquisa acrescenta uma consulta Exa de US$ 0,007, com cinco resultados e `max_tool_calls: 1`. A etapa de pesquisa é provisionada pelo contexto máximo; extração/refinamento usam limites UTF-8 e saída de 3.500 tokens. O excedente reservado é liberado; não se cobra acima do aceite.

Fotos são decodificadas no servidor por `@informach/ai-core/vision-image` em um JPEG de 1280×1280 sem EXIF, inclusive para fontes muito estreitas. Orçamento conservador de 3.000 tokens de imagem, somado às instruções e saída, permite reserva de 15 créditos dentro da franquia de teste de 20. Limites do decoder: uma página, 6 MB, 24 milhões de pixels, MIME conferido; a rota também limita o corpo. Usa Sharp 0.35.5, já resolvido no lockfile pelo Next, agora dependência direta. Referências: [constructor](https://sharp.pixelplumbing.com/api-constructor/), [resize](https://sharp.pixelplumbing.com/api-resize/) e [visão OpenAI](https://developers.openai.com/api/docs/guides/images-vision).

Áudio é PCM validado no servidor, até 120 segundos; tarifa de um crédito por minuto iniciado, somada às etapas seguintes quando existirem. Isso não equivale a custo USD medido. O valor informado pelo gateway continua na telemetria sem conteúdo, e sua ausência não vira zero. Não há fallback silencioso de modelo. Conferir orçamento/custos reais do gateway antes da ativação.

Ensaios locais: decoder real (dois casos), 43 testes integrais Cozya em PostgreSQL e, após incluir exportação autorizada, 12 casos do fluxo IA passaram. Provedor foi simulado; isso não é homologação paga da qualidade culinária nem liberação comercial. Conversão financeira dos saldos antigos ainda precisa conservar seu poder de uso antes de ativar a nova tarifa em produção.
