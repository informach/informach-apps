# Métricas internas do Missão Saber

As métricas aparecem somente na área restrita de manutenção. São contagens de contas responsáveis, calculadas com fatos persistidos no PostgreSQL. Não enviam respostas, textos do caderno, apelidos ou dados de estudantes a serviços de analytics.

| Métrica | Numerador | Deduplicação |
| --- | --- | --- |
| Famílias no produto | Responsáveis com registro em `missao_saber.families` | Uma vez por `user_id` |
| Primeiro perfil | Responsáveis com ao menos um perfil do Missão Saber | Uma vez por `user_id` |
| Primeira missão concluída | Responsáveis com ao menos uma sessão concluída no modo `mission` | Primeira conclusão entre todos os perfis |
| Checkout iniciado | Responsáveis com evento persistido `billing.checkout_started` cujo produto começa por `missao_` | Uma vez por `actor_id` |
| Assinatura confirmada | Responsáveis cuja assinatura do customer isolado no app `missao-saber` possui o marco positivo e persistente `confirmed_at` | Uma vez por `subject_id` |
| Retorno nos dias 7 a 13 | Responsáveis elegíveis que concluíram outra sessão entre o 7º e o 13º dia civil depois da primeira missão | Uma vez por `user_id` |

O marco `confirmed_at` é gravado na primeira ativação/trial confirmado pela Stripe ou no primeiro `invoice.paid` e permanece depois de um cancelamento. Fechar uma assinatura `incomplete` sem ativação não cria esse marco. O produto não oferece trial nesta versão, mas um trial confirmado pelo provedor é tratado como assinatura habilitada enquanto existir.

Dias civis usam `America/Sao_Paulo`. O denominador da retenção recebe a coorte somente no início do 14º dia depois da primeira missão, quando a janela inclusiva dos dias 7 a 13 terminou. Uma sessão no mesmo dia ou nos seis dias seguintes não conta como retorno da segunda semana; uma sessão no dia 14 já fica fora da janela.

Contas listadas em `MISSAO_METRICS_EXCLUDED_EMAILS` são retiradas de todos os numeradores e denominadores. O painel informa quantas exclusões configuradas foram encontradas. Uma conta Informach criada antes de usar o produto só entra quando cria família/perfil ou alcança outro fato do Missão Saber; ela não conta como novo cadastro global.

Os números descrevem o ambiente atual. Com uma família ou uma amostra pequena, o painel deve mostrar contagens e exemplos operacionais, sem calcular promessa de aprendizagem, eficácia pedagógica ou taxa comercial representativa.
