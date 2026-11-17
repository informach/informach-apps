# Perfis sob responsabilidade declarada

Parte de F1–F3. Decisão do titular: o adulto cadastra seu perfil ou o de uma
criança sob responsabilidade própria. Não existe fornecedor de verificação;
compra, declaração e verificação externa não são fatos equivalentes.

## Modelo e fronteiras

`adult_declarations` registra o aceite nativo de uma versão da declaração.
`minor_profiles` guarda somente mês e ano de nascimento e só se liga a perfil
`minor`, por FK composta. `guardian_links` identifica o responsável atual e a
declaração dele por FK composta; pagar o grupo não cria esse vínculo.
Eliminar a identidade responsável exige resolver primeiro esses vínculos,
sem apagar implicitamente progresso compartilhado ou cadastro de outra pessoa.

Cadastro: conta nativa atual e recente → grupo próprio → limite de quatro
jogadores → perfil menor → mês/ano → vínculo explícito → auditoria estrita.
Sem perfil adulto obrigatório. Repetição exige recibo próprio para não criar
dois filhos após perder a resposta. A chave idempotente não vai à auditoria.
O servidor prepara uma intenção de 15 minutos antes da gravação. A confirmação
consome essa linha com perfil e resumo do pedido na mesma transação. Não criar
intenção quando receber um ID desconhecido. Recibos confirmados duram 24 horas;
exclusão do perfil conserva o recibo sem referência, impedindo recriação por
repetição antiga. A limpeza não torna um ID desconhecido válido.
O schema é aditivo e a migration é gerada no GitHub, nunca editada à mão.

Idade e classificação são calculadas no servidor com o relógio admitido após
as esperas; duas camadas: social até 12/13–17 e limite L/6/10/12/14/16. Aos 18,
o perfil continua protegido até a transição explícita para conta própria.
Nenhum jogo recebe mês/ano ou identidade do responsável. Classificação
`em_analise` continua incompatível com menores; não reclassificar o Morada para
fazer o teste passar. O jogo interno L prova o contrato da plataforma.

## Sequência e aceites

1. Contratos de nascimento e declaração, cálculo puro com meses limite,
   recusa de nascimento futuro e cadastro inicial com 18 ou mais.
2. Schema, geração remota, conferência de proveniência e PostgreSQL descartável:
   FK não aceita responsável/declaracão de outra conta nem metadados infantis
   em perfil adulto. Auditoria nunca recebe nascimento, apelido ou conteúdo.
3. Autoridade nativa recente vinculada ao aparelho, depois das travas. Criação
   idempotente com grupo sem jogador adulto; quota também na criação própria.
   Duas criações concorrentes não ultrapassam o limite e falha de auditoria
   reverte perfil, vínculo e recibo.
4. Formulário e gestão de filhos, seleção autorizada e política efetiva. Manter
   credencial infantil bloqueada para gestão e compras; pareamento/PIN em F2.
   Antes da ativação em produção, concluir a autoridade infantil nas APIs do
   SDK, o limite de conteúdo e as provas de chamadas diretas em F2–F3.
5. Testar família com pagante sem perfil, contas distintas e quatro jogadores;
   completar convites/cobertura e os demais aceites de F1 antes de marcá-lo feito.

Estado: projeto do incremento; não comprova cadastro infantil implementado,
verificação de idade ou liberação para menores em produção.

## Sequência da geração

A primeira geração (`43991804537`, fonte `0694e16`, artefato `14287502455`)
foi rejeitada na revisão: o Drizzle colocou a FK composta de `minor_profiles`
antes de criar a UNIQUE de `profiles(id, kind)`. O SQL não foi editado nem
aplicado. Gerar primeiro somente a UNIQUE existente e incorporar a migration;
depois reexportar o schema familiar e gerar a próxima migration com as tabelas.
O PostgreSQL descartável precisa aplicar a sequência inteira antes da publicação.

Sequência gerada e conferida por origem, tamanho e SHA-256:

- `0168_ancient_stingray.sql`: somente UNIQUE, geração `43992190592`, fonte
  `3da2354`, artefato `14288501104`, ZIP
  `95db3f95396c4a8c40c6d862ba9b9fc6278649e4d54fe2970830604947669a89`.
- `0169_nifty_rocket_raccoon.sql`: quatro tabelas e suas FKs, geração
  `43992662536`, fonte `d3df599`, artefato `14288930902`, ZIP
  `967f697817403b395165058c63bf85c37dba44a0515a904969c29abbad6fcafc`.

O backend em candidata prepara e confirma intenções, aceita a declaração e
registra perfil/vínculo/auditoria atomicamente. Usa calendário de Brasília para
mês/ano e relógio do banco após as esperas. A autoridade nativa compartilhada
com a gestão de aparelhos confere login e, quando exigido, os dez minutos de
autenticação recente. Ainda faltam a interface, a seleção infantil, os convites
e a proteção completa F2–F3; não ativar menores ou publicar estas migrations
isoladamente a partir da existência desse código.

A criação do perfil próprio também recebe a identidade nativa completa e a
revalida dentro da transação, inclusive em repetição idempotente. Um contexto
infantil ou pareado não pode usar o caminho antigo para criar um adulto. As
fixtures agora criam sessão de login real antes do jogador, reproduzindo a
ordem do fluxo web. A rodada inicial do backend (`43994513410`) identificou um
operador `lte` ainda não reexportado por `@informach/db`; a correção usa a
exportação pública padrão do Drizzle, sem alterar dependências.

A rodada `43995929953`, fonte `4fce11a`, passou em tipos, navegador, versões,
cliente e simulação longa; a integração passou 358 casos e falhou em quatro do
lote de expiração. O novo caminho nativo tomava outra conexão para conferir
login no fallback PostgreSQL, esgotando o pool durante as criações concorrentes.
O caminho transacional passou a exigir o reader da transação. A prova existente
do lote e a nova prova determinística de dez escritores precisam passar sem
aumentar pool, prazo ou retirar concorrência.
