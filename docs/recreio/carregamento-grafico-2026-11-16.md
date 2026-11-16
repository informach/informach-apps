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
`0c118aaf` passou as cinco jornadas com arte em `43802946380`. A jornada antes
interrompida conseguiu pausar, editar, desfazer/refazer e restaurar. Isso prova
a jornada nessa rodada, não uma medida de latência de entrada ou FPS.

JS medido no gate completo: **1.247.937 bytes**, **345.039 gzip**; página da
marca 2.974 bytes. As 48 prévias retornaram a 1 contexto, 128 buffers e
44 texturas; máximos 203/46. No computador, quatro nomes legíveis e contorno
reservado amarelo. **No celular os nomes continuam ausentes**, apesar dos
corpos visíveis: o achado permanece aberto e requer diagnóstico da projeção
e das caixas do HUD, sem novas correções por suposição.

[Evidência numérica](evidencias/historico-arte-2026-11-16.json). ZIP original
do Actions preservado no rascunho privado 446608123, `artes-3d`, com 40.625.419
bytes e SHA-256 `d689df7706a2ca09a0d692fdea67d21945eb14ab460240ccb89ff6eb6b6c63ff`
igual ao digest do upload. Não recompresso nem ativado em produção. O registro
do rascunho conserva a limitação visual e a incompletude do D3.

Diagnóstico seguinte: o perfil gráfico passa a contar moradores, projeções,
rejeições por enquadramento e placas organizadas, sem nomes/IDs. A bancada
do cliente conserva o desenho real e registra essas contagens, âncoras e caixas
do HUD em computador/celular com editor compacto. Não altera o critério de
visibilidade nem anuncia correção: a prova focada deve localizar em qual etapa
as placas desaparecem antes de modificar o desenho novamente.

Prova focada `43806398763` (`875922da`) aprovada: computador/celular com
desenho procedural mostram nomes. A primeira execução não abriu Chromium;
instalação do navegador e caminho de preservação corrigidos antes dessa prova.
Na rodada completa `43807036615` (`491db949`), os dois casos novos passaram,
mas os dois casos seguintes de sessão curta falharam na entrada. O servidor
de desenvolvimento conserva membros de todos os arquivos no mesmo mundo:
as duas identidades novas atingiram seu teto de oito antes da entrada de Rita.
Não aumentar esse teto para a suíte passar.

A correção do executor inicia servidor/mundo próprios por arquivo de jornada,
preservando resultados em pastas diferentes. A bancada é construída uma vez
no mesmo checkout, sem reutilizar processos/mundos nem repetir testes falhos.
A nova rodada completa e a comparação privada com arte continuam necessárias.
