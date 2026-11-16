# Transferência durante o carregamento da página

## Achado e plano

O CI geral `43923717777`, job `133497460410`, falhou na transferência após
novo login. O rastro mostra `selectOption` às 304056 ms e clique às 304139 ms;
a tela terminou com a opção vazia e “Confira os campos e tente novamente”.
Os seis gates específicos da mesma fonte haviam passado; isso não torna a
falha geral irrelevante. ZIP da prova: artefato `14260710428`, SHA-256
`ce9a24bf4624a912f7d07889b23dbd2cf9fff17d5604616f2a7a34ac05b4c2bf`.

1. Reproduzir de modo determinístico com os scripts do Next suspensos,
   preservando HTML, servidor, autenticação e chamadas reais.
2. Desabilitar seleção e decisões até a interface concluir a hidratação.
3. Liberar os scripts e comprovar que os controles ficam disponíveis e a
   transferência com novo login continua funcionando. Sem espera fixa,
   repetição automática ou aumento de timeout para esconder o defeito.
4. Executar a regressão e os gates no GitHub. Registrar resultados antes de
   integrar. A prova humana em produção continua adiada pelo titular.

A documentação primária do Playwright descreve a seleção perdida antes da
hidratação e recomenda desabilitar os controles até ficarem funcionais:
[navegação/hidratação, versão 1.64.1](https://github.com/microsoft/playwright/blob/v1.64.1/docs/src/navigations.md#hydration).

## Reprodução determinística e alcance

Fonte `72608b3`, run `43937159361`, job E2E `133544668476`: o teste recusou o
seletor habilitado; os outros cinco gates passaram. A revisão posterior constatou
que o glob não abrangia as URLs `.js?dpl=...`. Portanto esse resultado não comprova
scripts suspensos. A prova será refeita com predicado sobre `URL.pathname` e
contador obrigatório de interceptações. Não reduzir a validade da autenticação
nem repetir a submissão para ocultar a seleção perdida no CI geral original.

A correção usa `@informach/ui/hooks/use-hydrated`, já existente e sem alterações
no package. A inspeção encontrou o mesmo intervalo nos controles de autenticação,
criação/edição e escolha do perfil, criação de mundo, entrada/emissão de convite,
desconexão de aparelho, saída da conta, saída e remoção de participação. Esses
controles também aguardam o estado interativo; links e `details` nativos continuam
funcionando. O formulário de autenticação mantém dados e mudança de modo
indisponíveis enquanto carrega ou processa uma operação.

O teste compartilhado bloqueia os scripts reais, comprova que houve interceptação,
confere os controles no HTML, libera os scripts no `finally` e exige habilitação.
Não simula os serviços ou o mecanismo de hidratação. Novas jornadas percorrem
entrada e as telas autenticadas; a transferência continua até aceite, reentrada
e saída com as duas contas sintéticas. Controles em `details` fechados são
consultados explicitamente com `includeHidden`, sem alterar a confirmação.

Estado: correção aprovada no GitHub e integrada; ativação ainda pendente.

## Correções do ensaio

`07ab143`/`43939056103` recusou três testes porque o contador de scripts era zero;
essa recusa expôs o glob incorreto. A fonte `38faa83` usa `URL.pathname` e
intercepta os scripts, mas `unroute` corria com o `fallback` para o interceptador
de IP sintético do contexto, gerando `Route is already handled`. A limpeza passa
a `page.unrouteAll({ behavior: "wait" })`: estes ensaios reservam as rotas de
página para o bloqueio e conservam as rotas do contexto. Aguardar os handlers é
parte da prova; não usar `ignoreErrors`, catch vazio ou elevar os timeouts.

`aa67c43`/`43942488391` demonstrou que aguardar a remoção não resolveu a disputa
da cadeia `page.route` → `context.route`. A fixture passa a compor a suspensão
no interceptador de contexto que já injeta o IP sintético somente no portal.
Há um único `continue` por requisição, sem instalar/remover rotas durante o
carregamento e sem mudar os limites de autenticação. A pausa é exclusiva do
aparelho de teste, contada e liberada no `finally`. Refazer a comparação com
essa mesma fixture nas duas fontes antes de considerar a prova válida.

## Resultado da comparação

Fontes com arquivos E2E byte a byte idênticos: base `02173393`, run
`43944353352`, e correção `7f3a7e2`, run `43944326569`. A base falhou exatamente
nos três testes esperados: entrada, controles autenticados e transferência,
sempre por controle habilitado com os scripts suspensos. Dez jornadas passaram
e duas são skips próprios da matriz. Não houve erro de interceptador nessa prova.

A corrigida passou os seis gates. O navegador passou as 13 jornadas e manteve
os dois skips específicos; a transferência percorreu login recente, proposta,
aceite e saída. Integração com PostgreSQL: 325 testes. Qualidade, cliente,
troca entre versões e simulação longa também aprovados. O CI geral da main
anterior `43931150504` passou; isso não substitui o gate geral da nova fonte.

Captura recebida em largura de 390 px revista: consequências e ambas as decisões
legíveis, com rolagem vertical. Artefato `14263973033`, ZIP SHA-256
`0ea5dbe9f6d53b252a6cc8cc654b7d196813e3f778ae2f74b6d6f7498337f074`.
São contas sintéticas. O arquivo novo `entrada-pronta.png` foi gerado pelo teste,
mas não consta da lista de capturas retidas pelo workflow; não foi declarado
revisto. A prova de carregamento é a execução funcional com scripts suspensos.

O titular adiou a prova humana da transferência. Nenhuma conta piloto foi usada
para simulá-la. Não houve mudança de autorização, schema, protocolo, arte ou
política de cobrança; A5, restante de A6 e a homologação integral permanecem abertos.
