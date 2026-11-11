# Compasso: proposta de reestruturação dos aplicativos web

Apresentação versão 4, revisada em 10/11/2026 com o corte interno para as contas de desenvolvimento. O titular autorizou a migração completa e aprovou preço, capacidade, teste e créditos. O andamento técnico vigente está em [implementação](implementacao.md), com as condições econômicas em [economia da IA](economia-ia.md). A apresentação explica o projeto; não comprova operação em produção.

A [proposta visual](proposta.html) está salva na [página privada de apresentação](https://chatgpt.com/space/page_95335cdee98081919aaeb222704fa2d0). Contém catálogo, pessoas e permissões, carteira, protótipo da central, arquitetura, migração, critérios de aceitação e simulador econômico.

## Decisões aprovadas

- **Quatro produtos independentes:** Compasso, Recreio, Morada e Suíte Edi. Compasso abrange os apps web elegíveis que não são jogos, inclusive futuros apps quando publicados e integrados. A orientação explícita do titular substitui a premissa da apresentação v2 que colocava Morada dentro do Recreio; esta migração não altera os projetos dos jogos.
- **Compasso** é marca independente, sem “Informach” no nome. Disponibilidade da marca ainda não verificada.
- **R$ 49,90/mês ou R$ 499/ano**, até **2 adultos e 4 dependentes**, teste de **14 dias sem cartão** iniciado explicitamente.
- **200 créditos mensais**, sem acumular; **20 no teste**. Recargas sem vencimento: **100/R$ 14,90; 300/R$ 39,90; 1.000/R$ 99,90**. Saldo antigo conserva validade e poder de uso. Operações informam o custo antes da execução; recargas continuam utilizáveis após cancelamento.
- Central da conta para dados pessoais, segurança, pessoas, assinaturas, cancelamento, créditos e privacidade. Dados particulares dos apps permanecem em seus domínios; responsabilidade, acesso e pagamento são relações distintas.
- Reestruturação integral, com migração, verificação, documentação e retirada das estruturas substituídas.

## Implementação e pendências

A base compartilhada, a central e os cinco consumidores têm implementação local e evidências de testes descritas no registro técnico. O encerramento durável e a restauração sintética foram ensaiados localmente. A revisão integral, a limpeza final, o ensaio do corte e a verificação da recuperação no ambiente real continuam pendentes. Venda e publicação não foram ativadas.

A regra comercial de transição dos assinantes atuais aguarda resposta à pergunta já enviada. A recomendação mostrada no HTML é liberar Compasso após aceite, encerrar renovações antigas e iniciar a cobrança nova somente no fim do último período já pago, mantendo as franquias antigas com poder de uso equivalente até lá. Isso permanece recomendação, sem execução autorizada dessa condição.

## Verificação da apresentação

Versão 3 verificada em Chromium local nas larguras 320, 390, 736 e 1024 pixels, sem rolagem horizontal do documento. Conferidos seleção dos quatro produtos, preços mensal/anual aprovados, cinco telas da central, cenários de migração e simulador com prejuízo e entrada inválida. Sem erros JavaScript nessa execução. Capturas do portfólio, créditos no celular e oferta no tema escuro foram inspecionadas.

O salvamento e o novo vínculo do HTML na página foram conferidos por leitura posterior. A renderização foi inspecionada localmente, não no visualizador remoto. O HTML não chama APIs nem lê dados de clientes; os custos do simulador continuam hipóteses. As referências de preços antigos identificam o catálogo histórico consultado, não uma oferta atual conferida na Stripe.

## Continuidade

Seguir [privacidade e encerramento](privacidade-conta.md), [migração financeira](migracao-financeira.md), [implementação](implementacao.md) e o [runbook da central](../../../apps/conta/PRODUCAO.md). Manter separadas as evidências de implementação, testes, configuração remota, implantação e cobrança.
