# Recreio — trocas de plano com consentimento e recuperação

Incremento restante de F6, autorizado pelo fechamento da plataforma. Fonte de
produto relida: `artes-3d/paginas/recreio.html`, seção Planos e acesso. Este plano
não implementa nem habilita trocas por si só.

A classificação pura das doze trocas entre as quatro ofertas está em
`troca-regras.ts`, ainda sem ligação com a cobrança: aumento de cobertura é
imediato; redução de cobertura aguarda o fim do período. Mantida a cobertura,
mensal → anual é aumento e anual → mensal é redução. Essa decisão não comprova
proporcional, aceite, agenda, persistência ou disponibilidade em produção.

## Comportamento obrigatório

- Aumento: imediato, com proporcional calculado pelo Stripe e apresentado antes
  do aceite. A capacidade maior depende da liquidação confirmada da fatura.
- Redução: no fim do período já pago. O pagante escolhe quais perfis continuam;
  perfis, identidades e progresso dos demais são preservados.
- Cancelamento: no fim do período; recuperação usa os mesmos perfis/mundos.
- Conta pagante, gestão familiar, responsabilidade infantil e gestão de mundo
  permanecem autoridades distintas. Toda decisão financeira exige adulto nativo
  atual e login recente, sem exigir perfil jogador.

## Contratos a implementar

1. Recibo nativo de troca ligado ao pagante, grupo, modo, assinatura e aceite
   original. Oferta, prazo, data do proporcional e seleção são imutáveis após
   admissão. Tentativa anterior ao I/O; resposta desconhecida mantém revisão.
2. Adaptar o provedor compartilhado sem reutilizar o downgrade legado que cancela
   e recria assinatura. A agenda deve alterar o mesmo contrato; namespace nativo
   conserva idempotência e metadados distintos dos contratos Compasso.
3. Manter a origem do Checkout original mesmo quando muda o produto atual.
   A conciliação exige o novo consentimento para admitir o novo preço; não edita
   o aceite inicial nem aceita apenas o preço observado como autorização.
4. Proporcional usa `pending_if_incomplete`: não conceder plano maior diante de
   pagamento pendente, ação adicional ou resposta perdida. Consulta posterior
   comprova a operação exata; limite de idempotência não autoriza novo débito.
5. Redução conserva cobertura atual até a vigência confirmada. Aplicar somente
   escolhas ainda válidas de perfis do próprio grupo, com revisões conferidas;
   uma revogação posterior nunca é restaurada pela agenda antiga. Se a seleção
   mudou, exigir resolução explícita sem apagar dados ou conceder vaga a outro.
6. Captura técnica de operação admitida persiste após logout; nenhum URL, fatura
   ou resultado financeiro é entregue sem nova autorização após a rede.
7. Auditoria, revisão comercial, cobertura e revogação de ingressos/SIDs são
   transacionais; rede permanece fora das travas PostgreSQL.

## Verificação e implantação

O adapter compartilhado ganha a composição explícita
`createStripeRecreioPlanSchedules`: namespace de idempotência próprio,
modo/customer/aceite/pagante originais conferidos antes da escrita e metadata
do Checkout preservada na fase futura. Agenda anexada sem correlação exata
não pode ser adotada; a fase é relida antes de admitir a aplicação. A fábrica
Compasso mantém o namespace e o comportamento comercial anteriores. O novo
adapter ainda não está ligado ao app, não persiste aceite nativo nem concede
cobertura. Sua prova com SDK e transporte HTTP fechado não equivale a uma
agenda executada pelo Stripe externo.

Gerar eventual DDL no GitHub e adotar SQL/snapshot/journal intactos com hashes e
predecessor. Provar upgrade/replay e integridade de pagante/modo/origem. Gates
com SDK/HTTP fechado e PostgreSQL cobrem concorrência, aceite divergente,
resposta perdida, ação de pagamento, agenda, redução e revisões/revogação.
Homologação externa no Stripe de teste cobre fatura proporcional, inadimplência,
renovação e execução da agenda, sem clientes ou chaves live. Fluxo familiar e
capturas de navegador integram o aceite; testes pesados somente no GitHub.

Schema aditivo em preparação: `plan_changes` conserva cotação/aceite/tentativa e
resultado distintos; `plan_change_profiles` conserva a seleção completa e a
revisão de cada perfil. `billing_contracts` aponta somente para a oferta atual:
a referência composta exige o mesmo contrato, compra, pagante, grupo, modo,
destino, aplicação e revisão. Um recibo histórico isolado não autoriza retornar
a um plano anterior. A primeira revisão fica presa à compra original. Não há
backfill nem mudança de assinaturas existentes nesta DDL; a restrição única
adicionada à compra inclui sua chave primária. A geração e a prova das
restrições precisam terminar antes de compor qualquer escritor ou habilitar
trocas. Não alterar SQL/snapshot/journal gerados manualmente.

A geração `44341859833`, fonte `014687cf`, foi inspecionada e recusada sem
adoção: o Drizzle posicionou as FKs novas antes da `UNIQUE` composta na compra.
O artefato permanece arquivado com hashes; não foi aplicado nem copiado para o
journal. A geração fica dividida: primeiro exportar somente a nova chave da
compra; depois, com a migração preparatória adotada, exportar as tabelas de
troca e gerar a migração seguinte. O arquivo `recreio-planos.ts` fica fora da
exportação do schema apenas durante essa preparação. Nenhum escritor depende
dele nessa candidata intermediária.

A migração preparatória `0209_true_gabe_jones.sql` foi gerada em
`44342573592`/`0770ed21` e adotada intacta depois de conferir os três hashes,
o predecessor e todo o prefixo do journal. Contém somente a chave única da
compra. [Proveniência](evidencias/migracao-trocas-chave-0209.json).
O schema das novas tabelas volta a ser exportado para gerar a etapa seguinte.
Essa adoção não é aplicação em banco nem comprovação das restrições.

As tabelas foram geradas separadamente em `44343024899`/`a5025f6a`, como
`0210_polite_santa_claus.sql`, e adotadas intactas com os três hashes, predecessor
e prefixo do journal conferidos. A chave 0209 agora antecede todas as FKs novas.
[Proveniência](evidencias/migracao-trocas-tabelas-0210.json).

A conciliação passa a inicializar a revisão um sob a mesma transação da
observação financeira completa, depois de comprovar a compra original. Replays
releem o contrato e não sobrescrevem outro destino/revisão. Isso ainda não
implementa aplicação de trocas: observação divergente continua em conferência.
As regras puras da seleção conferem inventário completo, IDs, grupo, revisão,
situação atual e autoridade de cobertura; exclusão ou revogação posterior exige
nova seleção. Ainda faltam os escritores de cotação/aceite/aplicação, a ligação
do leitor de acesso à revisão atual, o upgrade proporcional e as telas.

O catálogo de teste já possui evidência própria; isso não comprova trocas ou
pagamentos. Nenhuma DDL F6 ou alteração comercial foi implantada em produção.
