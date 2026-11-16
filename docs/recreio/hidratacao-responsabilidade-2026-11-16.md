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

Estado: regressão preparada; correção e validação ainda pendentes.
