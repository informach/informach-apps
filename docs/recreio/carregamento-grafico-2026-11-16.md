# Chegada da arte e resposta da interface

A fonte `2696bcbe` passou os seis gates públicos em `43798359814`, inclusive
o histórico pelo portal. A primeira rodada privada dessa fonte, `43799128058`,
falhou no primeiro clique em «Concordar» da convidada. Compatibilidade e
decoração/restauração nos dois aparelhos passaram; a criação/48 prévias não
executou. Não classificar essa rodada como cinco jornadas aprovadas.

O screencast da convidada tem uma lacuna de **16,18 s** entre os instantes
32.284,852 e 48.465,512 ms. Antes aparecem formas provisórias; depois, a arte.
A página da anfitriã continua produzindo quadros. O botão existe e o log
para na espera pela estabilidade; não é o bloqueio por sobreposição corrigido
anteriormente. Isso localiza a pausa durante a chegada dos recursos, mas não
substitui um perfil de CPU/GPU nem comprova sozinho qual chamada bloqueou.

## Correção em homologação

Antes de renderizar novos materiais, preparar os programas com
`WebGLRenderer.compileAsync`, usando a mesma cena, câmera, luzes e contexto.
O loop continua atendendo a interface enquanto aguarda. Uma preparação em
curso e somente a alteração mais recente em seguida; resultado de geração
anterior não libera a nova. Falha é entregue uma vez, sem tentar novamente
a cada quadro. Desmontagem impede tocar um renderer já descartado.

Chegada de corpo avisa separadamente da mudança no ambiente: preparar seus
materiais não deve reconstruir a casa e todos os móveis. Troca de qualidade,
reconstrução e restauração de contexto invalidam a preparação. A espera conta
no intervalo do próximo quadro renderizado; não apresentar uma medida de FPS
que desconte artificialmente esse período.

Os nomes na borda também têm um segundo recorte: o frustum padrão de Sprite
não representa a placa deslocada por `center`. Desabilitar esse recorte nos
rótulos, cuja visibilidade já é determinada pelo organizador limitado a 24,
corpo em quadro, janela e caixas do HUD. O resto da cena conserva seu recorte.

Testes focados cobrem fila limitada, alteração durante a espera, erro,
restauração e desmontagem. Gates completos, nova jornada com arte e exame das
imagens continuam necessários. Sem clique forçado, aumento de timeout,
desligamento do trace ou teste gráfico nesta máquina.

`4aa8b48a`, prova focada `43801800272`: tipos, testes do núcleo/cliente/ator e
orçamento de bundle aprovados; 1.247.868 bytes, 345.027 gzip. Um ajuste seguinte
também evita atualizar poses repetidamente enquanto a preparação está em curso,
mantendo a espera no intervalo do próximo quadro desenhado. Os testes completos
de navegador e a nova prova privada continuam pendentes; ainda não declarar
resolvida a pausa observada na fonte anterior.

Fonte `59f2614a`: os seis gates públicos da execução
[43802126864](https://github.com/informach/informach-apps/actions/runs/43802126864)
passaram. Inclui jornada de duas contas/desfazer/refazer/restauração, cliente,
integração, qualidade, versões reais e simulação longa. O executor privado
`0c118aaf` foi fixado nessa fonte para repetir as cinco jornadas com arte;
resultado e exame das imagens ainda pendentes.
