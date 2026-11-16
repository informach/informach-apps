# CI documental do Recreio integrado

A mudança separa documentos delimitados do Recreio dos gates de código.
O classificador consulta o diff completo entre os commits, sem limite de 300
arquivos e sem converter uma remoção de código em simples renomeação de documento.
JSON fora de `docs/recreio/evidencias/`, código, manifests, lockfile, workflows e
documentos de outros produtos continuam exigindo o pipeline completo.
Execução manual também mantém o pipeline completo.

A concorrência passa do workflow para cada job. Um novo código pode cancelar
um gate antigo da mesma referência. Um envio apenas documental executa o
formatter e não deve cancelar o job completo que já está em curso. Os comandos,
bancos e testes do job completo não foram retirados ou flexibilizados. O job
documental instala apenas ferramentas da raiz sem executar os scripts nativos
dos aplicativos; o job de código continua com a instalação completa normal.

O caso de renomear `packages/exemplo/com espaço.ts` para um `.md` reproduziu
uma recusa incorreta do gate em `9edb0c3`, run `43932807710`: o classificador
respondeu `false` quando deveria exigir testes de código. `--no-renames`
conserva a exclusão do caminho de código no diff. Os dois testes nativos,
incluindo 305 documentos mais um arquivo de código e a renomeação, passaram
no job `alteracao` `133530261051`, fonte `0e8e692`, run `43933044670`.
Esse run iniciou o job completo `ci`, como esperado para código.

O segundo envio `c063abd`, run `43933275778`, confirmou `alteracao` e
`documentos-recreio` aprovados, com `ci` ignorado. O run completo anterior
`43933044670` continuava em execução depois desse resultado. Nenhum job de
aplicativo foi declarado aprovado a partir do formatter.

O grupo do job completo passa a `ci-completo-<referência>`. Na migração, ele
não concorre com o grupo antigo do workflow completo ainda em curso na main,
que pode ser dependência de um deploy protegido. Entre novos jobs completos,
a política de cancelar código superado da mesma referência continua ativa.

Integrado em `38e8785` e `037badb`, sem mudanças nos aplicativos, packages,
lockfile ou configuração de produção. `CLAUDE.md`, `README.md` e `PRODUCAO.md`
do Recreio também estão na lista exata. Os dois testes do classificador passaram
no job `133536888506`; o CI completo da main `43935300744` iniciou depois da
integração. Este registro operacional precisa confirmar na main o gate documental
e a continuidade dos jobs completos `43935300744` e `43931150504`. O segundo usa
o grupo antigo e é mantido para não interromper uma implantação protegida do Edi.
Classificação e formatter não comprovam aprovação dos aplicativos.

O envio documental `6487560`, run `43937517618`, passou na main:
`alteracao` e `documentos-recreio` aprovados, `ci` ignorado. Depois do resultado,
às 19:17 UTC, os dois jobs completos `43935300744` e `43931150504` continuavam
em execução. O Railway ignorou esse envio para o portal (`cedaa6c2`, `SKIPPED`),
mantendo o build de aplicação `1ed101be` sem reinício documental.

O CI antigo `43931150504` terminou aprovado. A implantação protegida do Edi
`4467f347-bf05-40dd-843b-d76343d7f8e0`, fonte `1ed101be`, também foi conferida
em `SUCCESS`. A migração dos grupos preservou essa validação e o gate de deploy;
nenhuma configuração de `checkSuites` foi desligada para publicar.
