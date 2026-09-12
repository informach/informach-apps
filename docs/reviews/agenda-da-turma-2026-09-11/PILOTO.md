# Piloto comercial da Agenda da Turma

O produto foi implementado para testar a proposta; ainda não há validação de pagamento ou renovação. Não houve contato com famílias ou escolas durante este trabalho.

## Participantes e oferta

Recrutar 30 famílias com pelo menos três recados acionáveis por semana, priorizando ensino fundamental e uso de Teams/Batista ID. Incluir um e vários filhos e responsáveis com diferentes divisões de cuidado. Registrar fonte predominante, frequência e esforço atual; não coletar nomes de crianças na planilha do piloto.

Manter R$ 19,90/mês e R$ 199/ano. Cinco importações gratuitas por conta verificada demonstram o resultado sem cartão. Pro inclui até três crianças, dois adultos e automações. Para observar renovação no curto prazo, analisar a coorte mensal separadamente; uma compra anual não é renovação mensal.

Texto sugerido para convite, a enviar pelo fundador somente quando autorizado pelo destinatário:

> Estamos testando um app que transforma recados da escola e anexos em uma lista do que fazer, até quando e quem cuida. Você pode experimentar cinco recados sem cartão. Quer testar com a rotina da sua família e contar onde ainda dá trabalho?

Não afirmar parceria ou sincronização automática com Teams, Batista ou Layers. Não usar depoimentos ou nomes sem autorização específica.

## Sessão inicial de 20 minutos

1. Pedir que o adulto descreva o último recado que exigiu uma providência, como descobriu o prazo e quem cuidou. Perguntar sobre um esquecimento ou retrabalho concreto, sem sugerir que ele necessariamente exista.
2. Observar a pessoa localizar uma publicação, baixar o anexo, importar e revisar. Medir desde abrir a fonte até salvar, incluindo trabalho fora do app. O tempo técnico registrado começa na importação e não cobre todo esse esforço.
3. Conferir criança, ações, datas, horários, materiais e origem. Registrar qualquer data inventada como erro crítico, mesmo quando a pessoa consegue corrigi-la.
4. Pedir que encontre o que preparar para amanhã e combine um responsável. Se fizer sentido, convidar o segundo adulto e ativar um canal de lembrete voluntariamente.
5. Perguntar “O que você usaria novamente nesta semana?” e “O que ainda precisaria fazer fora daqui?”. Encerrar mostrando limites e preço, sem oferecer desconto antes de ouvir a reação.

Coletar amostras reais apenas com autorização e anonimização. Remover nomes, rostos, escola, contatos, documentos e links privados. Separar exemplos de desenvolvimento de exemplos de avaliação para evitar medir apenas casos usados para ajustar o parser. Não copiar recados reais para métricas ou tickets públicos.

## Acompanhamento por seis semanas

| Momento | Trabalho | Evidência |
| --- | --- | --- |
| Semana 0 | Recrutar e registrar processo atual; verificar disponibilidade das fontes | Família qualificada, volume, canal e tempo inicial |
| Semana 1 | Importar, revisar, concluir uma providência e experimentar lembrete | Primeiro resultado conferido, correções e esforço total |
| Semana 2 | Observar uso sem acompanhamento do fundador | Confirmação ou conclusão em nova semana; motivos de abandono |
| Semanas 3–4 | Oferecer continuidade no preço anunciado | Pagamento efetivo, objeções, suporte e custo por família |
| Semanas 5–6 | Acompanhar primeira renovação elegível | Renovação, cancelamento, motivo e valor percebido |

Metas de decisão são hipóteses do piloto: pelo menos 20 das 30 famílias chegando ao primeiro resultado útil, dez mensalidades efetivamente pagas e seis renovações entre os primeiros dez assinantes mensais elegíveis. Não declarar fracasso ou sucesso da renovação antes de completar o período de cobrança. Acrescentar a taxa de retorno na segunda semana e os erros críticos de extração ao parecer; pagamento isolado não prova retenção.

Se muitas pessoas importam uma vez e não voltam, investigar frequência da dor, esforço de buscar anexos e utilidade do lembrete. Se usam toda semana e não pagam, investigar benefício exclusivo, preço e alternativas gratuitas. Se pagam e cancelam, comparar expectativa criada com uso e qualidade. Não ampliar aquisição para compensar baixa renovação.

## Métricas disponíveis e limites

`pilot:report` apresenta clique no CTA, cadastro, tentativas, resultados, confirmações, conclusões, adesão familiar, notificações, atividade semanal, retorno na segunda semana e consumo de tokens. Pagamentos vêm de eventos `invoice.paid` processados do billing, deduplicados por fatura; clicar em “Assinar” não conta como pagamento.

“Visita qualificada” é operacionalmente um clique no CTA da landing, sem identificação persistente, e não visitante único. Retenção automática é por adulto; para evitar duplicar uma família com dois adultos, cruzar a coorte por identificador anônimo na planilha operacional. O relatório agregado de faturas mostra entradas e renovações no intervalo; ele não calcula sozinho a renovação da mesma coorte nem desconta reembolsos. Registrar elegibilidade e estornos na planilha. Dados locais sintéticos não entram no resultado comercial.

O arquivo [piloto-familias.csv](piloto-familias.csv) é um modelo vazio: não contém participantes ou vendas inventadas. Guardar o vínculo entre `familia_id` e contato de recrutamento separadamente, com acesso restrito. Registrar `preco_real` e moeda; não misturar faturas de teste com recebimentos reais.

## Economia para decidir aquisição

Por família e mês, calcular:

`contribuicao = receita_recebida - estornos - taxas_pagamento - tributos - custo_IA - custo_email_push - suporte_variavel`

`CAC = gasto_de_aquisicao_do_periodo / novas_familias_pagantes_atribuidas`

`payback_em_meses = CAC / contribuicao_mensal_media_positiva`

Usar as faturas efetivas de IA, e-mail e pagamento; tokens e créditos comerciais são unidades diferentes. Registrar minutos de suporte e um custo/hora explícito. Medir custos de tentativas gratuitas junto da aquisição, incluindo contas que nunca pagam. Separar custos fixos de infraestrutura; não apresentar contribuição como lucro líquido.

O teste pequeno não permite uma estimativa estável de LTV. Antes de ampliar orçamento, exigir evidência de uso repetido, renovação, contribuição positiva e poucas intervenções manuais. Se a captura manual continuar cara em tempo, usar esse resultado para priorizar a prova técnica de integração descrita em [INTEGRACOES.md](INTEGRACOES.md).
