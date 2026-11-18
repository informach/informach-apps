# Recreio — seleção na primeira compra

Achado de F6: os perfis criados no teste podem conservar várias coberturas
ligadas. A leitura atual do Individual limita pela ordem de criação. A compra
inicial precisa conservar a escolha explícita do adulto, inclusive na passagem
do teste Família para Individual. Um contrato pago não pode escolher o primeiro
perfil silenciosamente nem restaurar uma permissão alterada enquanto o Checkout
estava em andamento.

## Implementação

1. Acrescentar `purchase_profiles`, com a seleção completa, referência opaca,
   perfil atual anulável e revisão da política. A FK conserva exatamente compra,
   grupo, pagante, modo e produto. Exclusão invalida a seleção; não elimina o
   recibo. O grupo pode ter zero jogadores. Não guardar nomes ou nascimento.
2. Versionar o novo aceite da compra. A tela apresenta os próprios perfis com
   os nomes já autorizados pela gestão; exige escolha completa e até o teto da
   oferta. Payer sem jogador aceita a seleção vazia. Replay conserva os termos
   e perfis aceitos, sem atualizar o instantâneo.
3. Revalidar a seleção nativa antes da tentativa externa. Na confirmação
   financeira inicial, aplicar somente uma seleção ainda atual que conserva ou
   reduz coberturas ligadas. Nunca religar permissão revogada no intervalo.
4. Guardar recibo, oferta inicial, seleção e pagamento no mesmo commit da
   confirmação/revogação. Se os perfis mudaram, conservar fatos financeiros e
   marcar a revisão da seleção no contrato inicial. Acesso continua recusado.
   `purchase_selection_processed_at` registra uma única captura inicial,
   inclusive quando exige revisão. Confirmações financeiras posteriores não
   reaplicam escolhas antigas nem voltam a marcar revisão por perfis novos.
5. Generalizar a confirmação nativa já implementada: revisão um refere a compra
   original; revisões seguintes referem a troca aplicada. Nenhuma delas quita
   fatura. Audit da compra referencia a compra, sem inventar uma troca.
6. Provar saída do teste para Individual, zero perfis, entrada/retirada de perfil
   durante a rede, replay, isolamento, recusa de auditoria, seleção de revisão
   um e perda de resposta. Navegador e SDK/pagamento completo só no GitHub.

Uma cobertura desligada pode continuar fora da seleção da compra. Depois de
pagar, a gestão nativa permite escolher vagas com a autoridade atual; a cobrança
não precisa reativar automaticamente esse perfil. Compra e gestão continuam
distintas.

## Migração e implantação

Mudança de schema: tabela/marcador aditivos e retirada da checagem que só permitia revisão
de seleção após troca. O contrato já vincula a compra original por FK composta;
`coverage_review_required=true` apenas recusa acesso. A revisão inicial pode
precisar dessa mesma proteção. As demais FKs/revisões permanecem.

DDL gerado exclusivamente pelo workflow do projeto, adotado intacto com hashes,
snapshot anterior e prefixo do journal conferidos. Depois, gates de banco,
consumidores e jornadas. Antes de implantar esta primeira versão comercial,
conferir `purchase_authorizations`/`billing_contracts` vazios e escritores
comerciais desligados. Se houver recibos antigos, parar a ativação e desenhar
uma migração por proveniência; não interpretar ausência de seleção como aceite
vazio e não fabricar escolhas. Produção continua em F5 com cobrança desligada.

Esta frente não conclui upgrades, crédito anual, Checkout humano, F7–F11 nem
a homologação comercial completa.

## Candidata de implementação

0212 foi gerada em `44382246885`, fonte `d0217c69`, e adotada intacta após
conferir hashes, snapshot anterior e journal 212→213. A geração anterior de
`2cd340ec` não foi adotada: faltava o marcador de processamento único. A
[evidência](evidencias/migracao-compra-selecao-0212.json) registra a cadeia e a
condição de implantação. Produção continua em 204 recibos/0203.

O aceite v2 recebe seleção completa e conserva replay/recibo. A composição
nativa relê a escolha antes de admitir tentativa; pagamento aplica retenção ou
redução uma única vez na transação financeira. Divergência marca revisão um,
confirmada pelo adulto sem jogador com a oferta atual, sem inventar troca.
Cadastrar um perfil depois de ocupar a vaga de um contrato nativo não desloca
a escolha anterior; o novo perfil fica fora da cobertura até gestão explícita.

A prova nova atravessa o primeiro SID real do teste, conserva quatro perfis,
escolhe um que não é o primeiro e verifica a sessão anterior encerrada. Os
demais cenários cobrem revogação durante o pagamento, revisão inicial, marca
única, novo perfil e rollback por auditoria. A jornada de navegador conserva a
escolha na compra Individual e no recibo, antes de qualquer customer/Stripe.
Todos ainda precisam dos gates remotos desta candidata.

A consulta de um Checkout admitido também foi separada da abertura de novas
vendas: desligar vendas não impede GETs de recuperação nem habilita novo POST.
Mantém configuração de gestão, login recente, escopo e devolução autorizada.
