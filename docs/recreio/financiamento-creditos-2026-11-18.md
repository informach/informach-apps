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
ensaio anual externo usa também esse núcleo antes e depois da renovação/estorno.

`ffb206e0f3bff2d1bec64034f24b52b9b4c22d0a` passou no quality
`44404059457` e na [API real de teste 44404065298](https://github.com/informach/informach-apps/actions/runs/44404065298).
O grafo comprovou a fatura negativa e a renovação zerada, limitou o período
anual devolvido e revogou as provas dependentes depois do estorno da captura
original. Artefato 14474147788, 1.939 bytes, baixado e inspecionado; hashes e
limites no [recibo](evidencias/credito-origem-api-44404065298.json). Recursos de
teste removidos e limpeza confirmada. Essa é prova de API, não do kernel de
acesso, do aceite ou da persistência nativos.

O CLI usa a mesma condição Node `react-server` dos comandos administrativos
existentes, preservando o marcador `server-only`. O workflow roda tipos e os
testes fechados do coletor/núcleo/conferência antes de criar recursos no Stripe.
Comprovação da API não implementa persistência, acesso ou aceite nativos;
`nativeAnnualCreditFundingImplemented` permanece falso no recibo externo.

## Persistência nativa — preparação

A próxima etapa começa pelas chaves de escopo, antes das tabelas com FKs:
período financeiro `(id, subscription_id, provider)` e contrato Recreio com
assinatura, compra, grupo, pagante, modo e produto original. A identidade já é
única pelas PKs atuais; não há backfill de valores ou dados supostamente pagos.
Separar as duas gerações evita repetir a FK gerada antes da chave referenciada.
0214 foi gerada em `44405179681`, fonte `7d6aa5a3`, e adotada intacta depois de
conferir os três hashes, predecessor e prefixo do journal 214→215 no
[recibo](evidencias/migracao-financiamento-chaves-0214.json). Não foi implantada;
volume e risco de trava de produção ainda não foram medidos.

A prova deve conservar o período original e guardar separadamente estado,
fim financiado, versão e origens das capturas. A referência ao período não pode
apontar para outro contrato/provider, e a referência comercial não pode trocar
grupo/pagante/modo. Observações antigas não podem restaurar uma prova recente;
repetição com o mesmo relógio exige o mesmo conteúdo. Eventos de auditoria não
recebem valores ou conteúdo familiar. Não acrescentar um default que declare
históricos existentes comprovados sem leitura completa do provedor.

O novo índice em `billing` exige conferir volume e risco de trava junto dos
consumidores compartilhados antes de implantar; a geração não autoriza aplicar
migrations isoladas. A publicação continua exigindo migrator controlado,
backup/restauração, pré-condições comerciais e evidência da fonte final.

O schema seguinte separa observações imutáveis por hash semântico, ponteiro
atual com relógio monotônico, totais reais das capturas e referências aos
períodos de origem. Mesma prova reaproveita conteúdo; refresh não copia todo o
histórico a cada cinco minutos. Não inventa um valor alocado por captura quando
o ledger só comprova o agregado. As FKs prendem período/contrato/provider e
pagante/grupo/modo, inclusive uma origem em contrato anterior do mesmo pagante.
Fontes de outro adulto não são cobertura familiar implícita.

Esse segundo schema ainda precisa de geração, testes SQL/concorrência, escritor,
leitores e integração. O ledger é do customer: a leitura final também precisa
compor todos os seus contratos nativos antes de usá-lo, para tratar crédito de
uma assinatura encerrada consumido em outra. A conferência de API atual cobre
um único contrato e não certifica essa composição. Nenhuma prova de acesso ou
de persistência foi declarada a partir dela.

`30858f41`/`44406477539` gerou a primeira candidata 0215. Ela não foi adotada:
o nome automático da PK de fontes ultrapassou o limite de identificadores do
PostgreSQL. O schema passa a nomear explicitamente as PKs, sem editar a SQL
gerada. A geração substituta deve conservar predecessor/prefixo e passar nos
gates SQL antes de qualquer implantação.

A substituta `0215_thin_beyonder.sql` foi gerada em `44407101779`, fonte
`b1e6b535`, e adotada sem edição: três hashes, predecessor e journal 215→216
conferidos no [recibo](evidencias/migracao-financiamento-provas-0215.json). A SQL
difere da candidata recusada somente pelos dois nomes explícitos de PK; todos
os identificadores gerados têm até 58 bytes. Novos testes exercitam FKs de
período/contrato/owner, ponteiro atual, fontes, duplicação, retenção e valores/
datas inválidos. São fixtures de integridade SQL, sem alegar prova monetária
ou autorização de acesso. Precisam da rodada remota desta fonte.

`43b680fc`/`44408230466`: três cenários SQL e os testes financeiros anteriores
passaram; o cenário de FK encontrou primeiro a chave única porque duas fixtures
usavam o mesmo hash sintético. Cada fixture passa a gerar seu próprio hash;
o teste conserva a exigência de erro de FK para verificar a proteção pretendida,
em vez de aceitar uma recusa por outra constraint. Sem alteração da DDL.

## Composição dos contratos do cliente

A extensão `conferirCliente` recebe o inventário servidor de assinaturas do
customer, confere a origem do mesmo pagante em cada leitura e calcula o ledger
uma única vez para o conjunto. Une capturas repetidas somente se os fatos
forem idênticos; alteração durante a leitura exige nova conferência. Cada
contrato é relido no fim. O resultado tem marca privada, modo e pagante, mas
não substitui o aceite/contrato nativo que o escritor ainda deve admitir no
banco. Um corpo JSON do navegador não produz essa marca.

A API restrita a um contrato permanece separada. Ausência de contratos no
pedido não apaga movimentos existentes nem prova que não há saldo; referências
desconhecidas ficam em revisão. Quatro casos novos cobrem crédito carregado
de contrato encerrado, estorno da origem no contrato seguinte, metadata de
outro pagante e inventário duplicado/incompleto. Ainda precisam do gate remoto.

O ensaio externo anual passa a encerrar a primeira assinatura própria sem
pró-rata, abrir uma segunda usando o saldo e verificar a propagação do estorno
para as duas. Recursos conservam a etiqueta do mesmo relógio/run para limpeza;
continua apenas Stripe de teste, sem compra/aceite/jogo nativos. A extensão ainda
precisa de prova externa própria; o recibo `44404065298` cobre um contrato.

`b53f6a25`: qualidade `44409969520` aprovada; `44409975899` comprovou na API
de teste o saldo entre dois contratos e o estorno revogando as quatro provas.
Artefato de 2.071 bytes conferido e limpeza confirmada no
[recibo](evidencias/credito-contratos-api-44409975899.json). Esse resultado
substitui a pendência externa acima, sem qualificar aceite/Checkout/jogo nativos.
`27401026`/`44409536092` aprovou os 98 testes financeiros, inclusive os quatro
cenários SQL da 0215 com a correção de identidade da fixture.

## Escritor nativo — candidata em verificação

O escritor exige a marca privada da conferência do cliente e uma tentativa
nativa, relê identidade financeira e contratos, e exige períodos core com os
mesmos fatos e relógio. Datas e flags originais são preservadas; a projeção
inclui linhas positivas sem captura própria só após conferir a prova completa.
O ponteiro recusa leituras anteriores e conteúdo diferente no mesmo relógio.
Hash semântico reutiliza observações, capturas e fontes quando só o relógio
muda; mudança de estado conserva a observação anterior e registra auditoria
com IDs/estado. Referências são limitadas a 9.600 por captura nativa e gravadas
em lotes de até 250 linhas. Exceder o limite exige revisão, sem truncamento.

Novos testes remotos verificam projeção, escrita, refresh, estorno, relógios,
isolamento e rollback de auditoria. Os períodos core dessa prova do escritor
são pré-condições sintéticas: a composição financeira raiz e a leitura de
acesso ainda não usam o escritor. Nenhum serviço foi ativado ou implantado.

`d890ec0e`: `44412938591` recusou tipos das fixtures (captura de contrato,
nome `actorId` na auditoria e parâmetro HTTP ocultando o cliente). No gate
`44412944839`, os 98 testes anteriores passaram e os seis novos pararam no
endpoint sintético do cliente. Correção restrita às fixtures; repetir os gates.
