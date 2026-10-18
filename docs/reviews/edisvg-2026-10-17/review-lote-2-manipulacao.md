# Review incremental — timeline e manipulação

18/10/2026. Branch `feat/edisvg-evolution`, base `e15de57`. Este registro não conclui o lote 2 nem substitui o full review final dos lotes 0–6.

## Entregas verificadas

- Seleção múltipla no canvas/hierarquia, marquee, movimento entre espaços de pais diferentes e transação única no pointerup. Preview não muda o documento. Escape, pointercancel, blur, descarte da interface e contexto substituído não publicam o gesto.
- Duplicação/exclusão/ordenação da seleção, sem duplicar descendentes selecionados junto ao pai. Cópias renovam IDs de objetos/trilhas/chaves e preservam curvas; o deslocamento fica em `basis`, fora das propriedades animadas e seus limites.
- Comandos de poses/chaves em lote, retiming e cópia com escala/âncora/deslocamento. Colisões, IDs ausentes/repetidos, limites e locks recusam a operação inteira. Preflight limita trabalho antes da clonagem recursiva do payload.
- Timeline React virtualiza linhas e busca chaves por intervalo. Glifos próximos são agrupados por oito pixels, com contagem no nome acessível; zoom separa as chaves. Dados nunca são descartados. Seleção com Shift/Ctrl, mover/copiar/excluir e undo foram exercitados no navegador.
- Bézier com controles numéricos, alças arrastáveis e teclado, sem gravar o rascunho do diálogo. Escape restaura os controles. Elástico é uma função oscilatória amortecida própria, não uma Bézier equivalente fictícia.
- Documento v7 e movimento v2: pivô px/py, skewX e escalas assinadas/zero. Transformação compartilhada: translate(x+px,y+py), rotate, skewX, scale, translate(-px,-py). Alças de escala/rotação editam propriedades reais; Shift conserva proporção ou encaixa rotação em 15°. Espaços singulares recusam gestos, permanecendo corrigíveis no inspetor.
- Alinhar/distribuir, espelhar e posicionar o pivô no espaço global passam pela mesma transação de transformação; os limites medidos são geométricos, sem expansão de stroke. Encaixe em grade é contexto local, com desenho de linhas principais; não entra na exportação.
- Onion skin calcula quadros vizinhos com o avaliador/relógios de componentes. Overlays não têm IDs editáveis e não entram no documento/exports. Área de trabalho limita apenas o transporte de prévia; o clip exportado conserva toda a duração.
- Cache de uma composição/markup por sessão/revisão/prancheta evita validar/compilar novamente ao navegar sem editar. Alterações, undo/redo e substituição invalidam o cache.

## Achados e correções

1. Duplicar alterando x/y das chaves produziria movimentos diferentes perto dos limites/overshoot. Deslocamento isolado em `basis`, com regressão temporal.
2. Selecionar uma chave já pertencente a um conjunto conservava indevidamente a multisseleção num clique simples. Clique agora isola; arraste conserva o conjunto.
3. Nova animação conserva/clampa o playhead, não o volta implicitamente ao zero. Jornada de teste passou a posicioná-lo explicitamente antes da primeira pose.
4. Cabeçalho da timeline ampliado causava overflow a 980 px. Rolagem horizontal própria, sem expandir o documento.
5. Exportar funções com `toString()` dependia dos helpers emitidos pelo compilador TypeScript. HTML agora incorpora entrada offline compilada com dependências explícitas, incluindo presets legados; não serializa funções.
6. Novas operações de transformação exigiram corrigir ordem dos passos SMIL e versão de movimento herdada pelos drivers. A regressão compara todos os seis coeficientes entre avaliador, HTML e SVG, incluindo escala zero.
7. Preferências de um projeto podiam permanecer ao abrir outro sem workspace correspondente. Contexto de seleção/grade/timeline/onion/área agora é reinicializado antes de restaurar preferências validadas.

## Gates

103 testes do editor e 18 do núcleo passaram. Quatro E2E reais passaram no Edge/Chromium, incluindo HTML legado, animação própria, curvas, chaves em lote, componentes e comparação de matrizes HTML/SMIL. Typecheck transversal: 23 tarefas e tooling aprovados. A jornada nativa Windows aprovou integridade, gate, lease/expiração/IPC, Save/Open, cancelamento e recuperação com perfis/chaves efêmeros; repetição após a alteração do bundle offline ainda necessária antes de fechar este incremento. Não houve instalação/publicação, deploy, cobrança, commit ou push.

## Restante

Continuar o lote 2: seleção/edição avançada de vértices e segmentos, unir/separar/simplificar/booleanas; pintura/texto/importação ampliados e relatórios; painéis redimensionáveis, busca/contexto/atalhos. Reparenting ainda recusa atravessar grupos animados/translúcidos; não foi transformado em suporte irrestrito. A renderização integral da UI legada continua, embora a composição e a timeline tenham caminhos limitados. Medir cenas representativas antes de alegar ganho de FPS. Lotes 3–6 permanecem pendentes, não certificados por estes gates.
