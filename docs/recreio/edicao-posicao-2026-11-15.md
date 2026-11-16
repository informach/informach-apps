# Coordenadas efetivas e reserva na prévia

Fonte `499c44e8`: os seis gates públicos passaram, mas a rodada privada
`43788388654` falhou na compra depois da reconexão, na jornada de duas contas.
Compatibilidade e decoração/restauração nos dois aparelhos passaram; criação
com 48 prévias não chegou a executar. Não classificar essa rodada como aprovada.

O trace registra preenchimento de 3,5 m e 5 m após a volta, enquanto uma
imagem posterior da página da convidada ainda mostra a posição inicial
6 m × 7,5 m e o motivo de colocação inválida. A captura automática da falha
é da outra página; a página correta foi examinada no screencast do trace.

Cada campo usava uma cópia do outro eixo capturada no render. A correção
passa a atualizar somente o eixo alterado no rascunho atual. A posição efetiva
e o giro também ficam visíveis fora dos campos, inclusive na prévia compacta,
para a pessoa conferir antes de comprar. O teste espera essa saída observável,
em vez de inferir a posição pela edição imperativa de um input.

A reconexão volta o mundo a 1× por contrato: quem chega não concordou com a
pausa anterior. A jornada deve renovar o acordo por ambos os botões reais e
escolher uma posição atualmente livre; o mundo pode ter mudado durante a volta.
Não aumentar timeout, forçar clique ou desativar a validação espacial.

A captura também conserva o achado do contorno encoberto. `renderOrder` não
resolve a ordem entre fila opaca e transparente: a indicação da reserva passa
à fila transparente, com profundidade desativada e ordem posterior à prévia.
Isso não altera o alvo, a área ou a autoridade da concessão no servidor.

Capturas, trace e arte permanecem privados em `artes-3d/.work/` e nos artifacts
da rodada. A correção ainda exige tipos/testes, seis gates e nova prova com arte;
nenhum recurso D3 foi ativado em produção por este registro.

## Pedido de pausa e áreas ocupadas pela interface

Na candidata `4b9c78da`, cinco gates passaram, mas o E2E público
`43791742210` encontrou outro problema real: depois da reconexão, a barra de
ferramentas interceptou o clique em «Concordar». A barra começava a 120 pixels
do topo, embora o relógio cresça para acomodar o pedido. No editor, topo e
ferramentas passam a linhas consecutivas de uma grade. A jornada verifica a
separação das caixas antes de usar o clique normal; não há clique forçado.

A captura privada do celular também mostrou o nome da Vó Ana parcialmente
encoberto pelo painel compacto. O organizador passa a evitar as caixas dos
painéis. ResizeObserver e MutationObserver atualizam um cache após mudanças
da interface; a cena consulta esse cache, sem medir o DOM a cada quadro.
Casos puros cobrem painel aberto, fechado e tela inteiramente ocupada. Tipos,
testes e novas capturas continuam necessários para aprovar esses ajustes.
