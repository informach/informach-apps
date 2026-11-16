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

Fonte `72608b3`, run `43937159361`, job E2E `133544668476`: a seleção ficou
habilitada durante os 15 s de scripts suspensos, reproduzindo o defeito. Os outros
cinco gates passaram; dez jornadas passaram e essa falhou, com dois skips próprios
da matriz. Não reduzir a validade da autenticação nem repetir a submissão.

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

Estado: correção ampliada em verificação no GitHub; ainda não publicada.
