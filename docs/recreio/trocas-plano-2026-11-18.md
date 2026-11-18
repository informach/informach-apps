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
nova seleção. O leitor financeiro consulta a autoridade atual antes da compra
original: havendo contrato nativo, escopo/destino divergentes não recorrem ao
aceite antigo. Uma aplicação posterior à última conciliação não pode reutilizar
a confirmação anterior. Sem contrato nativo, permanece a prova inicial estrita
da compra, para os fatos anteriores a esta composição; isso não admite preço
alterado. Ainda faltam os escritores de cotação/aceite/aplicação, o upgrade
proporcional e as telas.

Fundação `e9433c97` aprovada nos dezesseis gates `44344445323`: inclui a
aplicação das duas migrations em PostgreSQL descartável, provas da autoridade
atual e da seleção, SDK/HTTP fechado e regressões do portal/jogo. A API externa
de agenda, renovação, cancelamento e estorno passou separadamente em
`44346637491`/`63bebd25`; [escopo exato](homologacao-stripe-api-2026-11-18.md).
O incremento seguinte fixa o segundo do proporcional e a chave de tentativa no
provider comum. A extensão externa com recusa e quitação do upgrade mensal
passou em `44348172426`/`3f725d4f`; o proporcional foi R$ 68,00 e o preço antigo
permaneceu até a quitação. [Prova](evidencias/stripe-api-upgrade-44348172426.json).
Isso não conclui os escritores/telas nativos nem habilita cobrança.

O próximo schema conserva também valor/intervalo da renovação e subtotal,
crédito e total da cotação; não recompõe esses termos aceitos a partir de um
catálogo futuro. Acrescenta revisão de seleção ao contrato atual para um
efeito remoto confirmado cujo inventário familiar tenha mudado. Esse sinal
bloqueia acesso até confirmação nativa própria, sem impedir registro dos fatos
financeiros nem restaurar perfis. A seleção automática só conserva ou reduz
cobertura atualmente ligada, mesmo diante de uma revisão inconsistente.

Esta nova DDL é anterior a qualquer escritor nativo de cotação em produção.
Os campos financeiros são obrigatórios e não recebem defaults inventados:
a implantação deve comprovar `plan_changes` vazia e conservar a cobrança
desligada durante a migração. Se houver recibos, interromper e preparar um
backfill com evidência; não preencher valores financeiros com zero.
Mensal/anual com saldo credor depende de rastrear a origem financeira: uma
fatura de valor zero isolada não comprova liquidação. Os casos anuais ainda
precisam de implementação e prova, sem alterar a regra de upgrade imediato.

`0211_volatile_smasher.sql` foi gerada em `44350625433`/`b0db958f`, revisada e
adotada sem editar os três arquivos. Os hashes, predecessor e prefixo do
journal foram conferidos; [proveniência](evidencias/migracao-trocas-termos-0211.json).
O journal candidato passa a 212 entradas. A condição de tabela vazia acima
é obrigatória para a implantação; nenhum zero foi usado como backfill.

`troca-entrada.ts` prepara o vínculo dos termos de aceite: cobrança atual,
subtotal/crédito/total, renovação, intervalo, revisão, vigência e versão devem
coincidir com a cotação persistida. O prazo é exclusivo, de cinco minutos; um
replay de aceite válido não inventa outro instante nem prorroga a cotação.
A validação conserva seleção sem duplicações/campos extras. Ela é pura:
autorização, persistência do aceite e operações de provedor ainda precisam
ser ligadas e comprovadas nos escritores nativos.

O catálogo de teste já possui evidência própria; isso não comprova trocas ou
pagamentos. Nenhuma DDL F6 ou alteração comercial foi implantada em produção.
