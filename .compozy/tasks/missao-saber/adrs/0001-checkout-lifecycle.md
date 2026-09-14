# ADR 0001 — intenção de checkout como proteção operacional da identidade

Status: aceito na remediação da rodada 007, em 13/09/2026.

O responsável compartilha a identidade entre os apps. Consultar assinaturas antes de apagar a conta não é atômico com um checkout iniciado ou confirmado durante a limpeza. O lock do Missão Saber coordena checkout, webhook, jobs e encerramento; a FK restritiva de `billing.checkout_intents.user_id` protege também o delete efetivo iniciado por outro app.

Esta é uma exceção operacional, opt-in e limitada a checkout de usuário. Não altera o owner polimórfico de clientes/assinaturas nem a retenção das tabelas financeiras. A intenção guarda os parâmetros da tentativa e permanece enquanto ela puder gerar cobrança, inclusive depois do webhook de assinatura ativa. Um webhook apenas liquida a intenção do cliente cujo lock está retido, após verificar estado remoto atual. Sessão aberta, resultado desconhecido antes do prazo fixo e assinatura não terminal mantêm a proteção.

Resposta perdida é recuperada pelo histórico da Stripe ou repetida com a mesma chave e os mesmos parâmetros. O prazo absoluto de uma hora impede que uma requisição antiga se torne pagável após liberar a proteção. Trocar de plano exige expirar links anteriores e conferir assinaturas remotas. O encerramento recupera a tentativa desconhecida, expira sessões, cancela assinaturas, grava tombstones e só então libera a guarda.

A migração 0042 é aditiva e gerada pelo Drizzle. Aplicá-la antes de disponibilizar a versão do app e os novos guards de exclusão. A validação foi feita apenas em bancos descartáveis locais. O piloto permanece sem preços reais ativados; não houve migração nem verificação de clientes em um ambiente de produção.

Evidências: [issue 001](../reviews-007/issue_001.md), [remediação](../reviews/remediation-007.md) e [parecer independente](../reviews/remediation-007-independent.md).
