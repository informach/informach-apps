# Chegada inicial da família

Achado visual nas capturas privadas do editor: a fundação coloca quatro
moradores em incrementos de 250 mm, sobrepondo corpos e nomes. Corrigir a
distribuição física antes de tratar a legibilidade dos rótulos na câmera.

Implementação prevista, sem alteração de formato ou reposicionamento de mundos
existentes: antes de consumir IDs, selecionar posições determinísticas próximas
à entrada, alcançáveis pela navegação, dentro do lote e separadas por pelo menos
1 m. Evitar volumes físicos de móveis mesmo quando não bloqueiam a navegação;
tapetes continuam admitidos. Busca limitada a uma vizinhança de 6 m da entrada.
Se não houver posições suficientes, recusar a fundação sem fatos, IDs ou saldo
parciais. Usar o cache de navegação do contexto; nenhum RNG ou relógio ambiente.

Verificar família mínima/máxima, lote estreito/entrada na borda, móveis,
determinismo, falta de espaço e restauração pelo fato. Todos os testes no
GitHub. Revisar capturas com arte antes de declarar resolvido o achado visual;
a organização dos rótulos ainda precisa de tratamento próprio.

A implementação candidata também corrige a camada de colisão dos três tapetes
legados que ainda eram tratados como volume; o tapete redondo já indicava piso.
As medidas, versões, preços e arte permanecem as mesmas. Os testes de chegada
exercitam os quatro tapetes, paredes, borda do lote, móveis e famílias de 1/4/8
moradores, além da recusa sem espaço. Ainda aguardam execução remota.

A primeira candidata `a73cdbf4` parou no gate global de qualidade por formatação
do JSON de evidência da rodada anterior; a inspeção focalizada tinha coberto
somente TypeScript. O JSON foi formatado conforme o Biome. A nova rodada precisa
executar qualidade/tipos/testes completos, sem atribuir a falha ao domínio.

`8bdf660e` chegou à tipagem e apontou que a fixture tentava substituir tabelas
pela visão `Readonly` do mundo. A preparação passa a usar uma fotografia
independente, sem cast ou remoção do contrato de leitura. O workflow focado
`morada-chegada.yml` confere tipos e os testes de chegada/fundação no GitHub
antes de repetir os seis gates e a homologação privada.

## Leitura dos nomes na câmera

A distância física não impede que nomes se cruzem em uma câmera afastada ou
em moradores já salvos próximos uns dos outros. O próximo incremento deve
organizar os rótulos em coordenadas de tela, com prioridade para quem a pessoa
dirige, afastamentos pequenos e conectores até os moradores. Respeitar a borda
da tela, conservar os nomes no HUD e limitar a 24 rótulos simultâneos na cena,
selecionados por prioridade/distância quando não couberem todos. Não mudar a
posição física dos moradores para resolver a projeção da câmera.

Usar os sprites existentes e um único buffer de segmentos para conectores;
nenhum renderer, contexto, textura ou material por quadro. Testar aglomeração,
prioridade, bordas, entrada/saída e estabilidade das posições. Conferir capturas
de computador/celular com arte e a distinção entre os nomes e os corpos antes
de encerrar o achado.

`f46230ee`: 19 testes de chegada/fundação e tipagem passaram no GitHub,
execução `43785157623`. A continuação implementa organização em tela e
conectores, com quatro testes puros próprios e tipagem do cliente no mesmo
workflow focado. Ainda falta a rodada integral e a revisão de capturas.
