# Participações próprias: acesso à saída fora da estante

Em preparação; este incremento não conclui A6. Testes e builds no GitHub.

## Lacuna

A saída voluntária já aceita membros `no_access` e `away` no servidor, mas
seu botão está no detalhe do mundo, que exige participação ativa. A estante
também não oferece esses vínculos. Cancelar o direito comercial não pode
impedir um adulto de deixar uma participação.

## Entrega

Adicionar `/conta/mundos`, acessível pela Conta, para o perfil adulto próprio
e aparelho de conta atual. Listar somente seus vínculos que não sejam `former`
em mundos não excluídos, sem personagens, participação opaca, códigos ou nomes
de outros membros. Paginar no servidor em 20 itens por UUID do vínculo, sempre
com filtro de perfil/conta/aparelho atual e prazo válido. Cursor nunca concede
autoridade. Falha de consulta não deve virar uma lista vazia.

Mostrar nome do mundo, estado da participação e papel. Membro/coadministrador
pode confirmar a mesma saída existente, inclusive afastado/sem acesso e sem
concessão comercial. Responsável não recebe esse botão: transferência aceita
continua pendente. Nenhuma reativação, novo direito de jogar ou mudança de
conteúdo/política de mundo é parte desta entrega. O detalhe atual conserva
suas guardas. Os textos de confirmação precisam IDs únicos quando repetidos.

## Arquivos e prova

Repositório/serviço de leitura em `features/mundos`, página e link na Conta;
componente existente conserva cancelamento, foco e ação confiável. Sem schema
ou mudança de SDK. PostgreSQL descartável: estados/escopo, adulto/aparelho
inválidos, paginação e saída real de participação inativa preservando os demais.
Navegador: acessar pela Conta sem concessão, cancelar, confirmar e observar
remoção da lista. Repetir os seis gates do Recreio antes de integrar.

Implantar somente código compatível com Mundo V2/protocolo 1/arte D2.
Não alterar contas piloto para produzir a evidência. Registrar versão, ação,
mapas e prontidão. Sucessão, arquivamento, exclusão/exportação e família seguem
abertos em seus contratos.

## Candidata preparada

Leitura transacional com perfil/aparelho sob SHARE, relógio relido depois
dessas esperas e limites de 5 s/1 s/15 s. Filtro do vínculo próprio e mundo
não excluído na mesma consulta; paginação por UUID sem tomar outra autoridade
do cursor. O serviço recusa cursor inválido. Erros propagam ao tratamento
normal, sem converter indisponibilidade em ausência de mundos.

Quatorze integrações novas cobrem estados, dados retornados, exclusão/arquivo,
23 vínculos em duas páginas, cursor alheio/inválido, oito autoridades inválidas,
saída afastada/sem acesso e falha real de consulta. A jornada de navegador
prepara dois vínculos afastados no banco descartável para uma conta sem
concessão, navega pela Conta, confere descrições distintas, cancela e confirma
uma saída, conserva a outra e confere a página do responsável. O fixture não
é API de produção e recusa banco/conta fora do padrão isolado. Gates remotos
ainda precisam ser executados; não implantado.

Os seis gates `43871778111` passaram sobre `473d6e36`: 234 integrações,
incluindo os catorze casos acima, e nove jornadas com dois casos reservados
a outros executores. A jornada nova levou 12,1 s no total, sem medir latência
de jogo ou hardware. A captura foi produzida, mas faltava seu caminho na lista
restrita de upload do workflow. Acrescentado somente esse PNG sintético de
conta, sem capturas do jogo ou ampliação de permissões. A próxima rodada
precisa preservar a imagem para inspeção. O código de produção não mudou.

A repetição `43873141755`, fonte `9f9f9e3a`, aprovou os seis gates e preservou
a captura. A imagem foi baixada e inspecionada: dois cartões legíveis,
consequências e controles de confirmação/cancelamento em cada um, com os
nomes sintéticos esperados. As descrições únicas também foram conferidas no
navegador. A candidata não contém arte do jogo nessa evidência.
[Prova estruturada](evidencias/participacoes-candidata-2026-11-16.json).

O conjunto com a migração aditiva 0164 será conferido em outra rodada antes
da main. A página não habilita a limpeza de convites; o escritor dessa limpeza
continua separado até a conferência do índice em produção.
