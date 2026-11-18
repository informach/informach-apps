# Recreio — financiamento dos créditos

Os ensaios [anuais](credito-anual-investigacao-2026-11-18.md) comprovaram os
fatos do provedor; a concessão nativa ainda precisa rastrear a origem monetária.
O problema inclui proporcionais mensais: pagamento próprio e crédito de uma
fatura antiga podem financiar juntos a linha nova. Estorno da origem precisa
afetar seus dependentes, e uma linha já creditada não pode voltar a conceder
todo o período antigo quando o mesmo preço for contratado novamente.

## Núcleo em qualificação

`financiamento-regras.ts` recebe fatos privados já isolados por cliente, modo,
contrato e moeda. Não consulta rede, relógio ou banco. Confere alocações das
capturas, soma das linhas, saldo e ledger completo em ordem do provedor. Não
inventa ordem por IDs quando timestamps empatam. Cada crédito refere exatamente
uma linha positiva anterior, mesmo preço e sufixo do período; créditos acima
do valor original, captura reutilizada e ciclos recusam prova.

A origem atravessa fatura negativa, saldo e consumo na renovação, inclusive
consumo final parcial combinado com nova captura. O ledger não atribui cada
centavo a uma captura. Por isso um saldo parcialmente consumido conserva,
de modo conservador, todas as origens até zerar. Nenhum rateio monetário por
captura é inventado. Um período posterior pago integralmente com dinheiro novo,
após saldo zerado, conserva sua origem independente.

O resultado separa `comprovado`, `revogado` e `em_conferencia`. Estorno total
ou contestação da origem revoga os dependentes; estorno parcial exige revisão.
Isso não altera os flags históricos de estorno/contestação da fatura própria.
O fim financiado é separado do fim original imutável: o sufixo devolvido em
crédito limita a cobertura antiga sem apagar ou reescrever o recibo financeiro.
Ajuste manual/credit note desconhecido não é promovido a captura.

Os testes incluem os valores externos observados, mensal com duas origens,
renovação de valor zero, saldo esgotado parcialmente, estorno/contestação,
independência de período posterior, ordem/paginação lógica, ciclos, limites e
duplicação. Precisam de execução remota antes de afirmar aprovação.

`3c1b7465`/`44399065613`: tipos passaram, mas o cenário de consumo final da
fixture subtraía a renovação de um saldo já negativo, aumentando o crédito.
A fixture passa a somar o consumo e subtrair a captura nova; as asserções de
saldo zerado, origens e estorno permanecem. Nenhuma regra do núcleo foi
afrouxada. O corretivo exige nova rodada remota.

O corretivo `47a17f88bd4d808053196aa1d50030a60ab4dc04` passou no gate quality
em [44400593264](https://github.com/informach/informach-apps/actions/runs/44400593264),
incluindo os doze testes do núcleo, tipos e regressões das áreas selecionadas.
Essa rodada é auxiliar e não substitui os dezesseis gates nem prova integração
com o Stripe/banco/acesso.

## Integração necessária

Este núcleo ainda não recebe o leitor do Stripe nem é usado para conceder
acesso. O próximo adapter precisa validar recursos e ler todas as páginas com
prazo, limites e prova de completude, conferindo novamente a fronteira do saldo
para detectar mutações durante a leitura. Scope externo não é inferido pelo
núcleo. Os fixtures de HTTP precisam conter os campos reais usados nessa prova.

Persistir no domínio Recreio as origens e a comprovação por período, junto da
confirmação financeira e oferta/seleção. Os períodos comuns conservam IDs,
datas e fatos originais; uma nova coluna não pode declarar históricos antigos
comprovados por default. Leitores de acesso devem exigir essa prova e limitar
o fim financiado. Replay precisa manter conflito da mesma observação e não
permitir que uma captura tardia mais antiga restaure um bloqueio mais recente.

Concluir provas com SDK/HTTP, PostgreSQL, fonte adversa durante a troca e depois
da aplicação, retorno a preço anterior e API real usando o núcleo. Só então
integrar as telas/ações completas e a homologação das doze transições. Venda,
trial e demais recursos comerciais de produção continuam desligados.

## Coleta normalizada em implementação

O leitor comum recebe `readWithFunding`, opcional e separado de `read`.
Reutiliza a mesma passagem por assinaturas, faturas, alocações e capturas, sem
duplicar chamadas. Coleta também as linhas de faturas zeradas, mantendo esses
períodos fora do snapshot comum até a comprovação explícita do app. Retém só
IDs, valores e referências de crédito, sem contato, descrições ou URLs.

A coleta exige modo explícito, cliente/assinatura/fatura/linha/alocação coerentes,
captura e PaymentIntent associados, moeda BRL, preço aprovado e totais completos.
Suas páginas renovam o prazo em cada request e recusam duplicação, cursor
vazio e falta de sinal de completude. O modo legado conserva a mesma interface
e sua paginação existente. Os oito cenários novos usam o SDK real em HTTP
fechado; ainda precisam de verificação remota. Coletar os fatos não valida o
ledger nem persiste a comprovação nativa; essas integrações permanecem abertas.

A coleta opcional passou em `afcdbd0d`/`44401841957` (quality, incluindo seus
oito casos novos) e preservou os 94 testes financeiros em `44401849575`.
O CI compartilhado dessa fonte ainda precisa terminar; a correção da fixture
Cozya está nela. A rodada completa anterior de execução continua em `03fa9ee6`.

## Conferência de ledger em qualificação

`financiamento-stripe.ts` compõe a coleta e o núcleo sem alterar o snapshot
comum ou conceder acesso. Confere cliente/modo/moeda de cada movimento, preserva
a ordem do provedor e exige que saldo e topo do ledger continuem iguais após
a paginação. Relê a assinatura no fim e recusa mudança de preço, período,
cancelamento, estado ou origem durante a leitura. Tempo e quantidade de páginas
são limitados; o resultado permanece privado e sem dados de contato.

Oito cenários SDK/HTTP verificam os valores anuais, dependência do estorno,
mudança de saldo/topo/contrato, paginação repetida, escopo e prazo vencido. O
ensaio anual externo passa a usar também esse núcleo antes e depois da
renovação/estorno. Ambos ainda precisam de execução nesta nova fonte.

O CLI usa a mesma condição Node `react-server` dos comandos administrativos
existentes, preservando o marcador `server-only`. O workflow roda tipos e os
testes fechados do coletor/núcleo/conferência antes de criar recursos no Stripe.
Comprovação da API não implementa persistência, acesso ou aceite nativos;
`nativeAnnualCreditFundingImplemented` permanece falso no recibo externo.
