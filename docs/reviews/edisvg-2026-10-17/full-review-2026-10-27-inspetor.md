# EdiSVG — full review do inspetor da prancheta

Data: 27/10/2026. Escopo: `git diff d3aaf093` sem `apps/edipdf/*`. Inclui os commits `997344d2` (campos no padrão do Rive) e `3bdbb5c8` (tamanho Fixo/Conteúdo/Preencher, projeto v24/blueprint v13), além do trabalho ainda sem commit: modelo e instância da prancheta e campos com duas casas decimais. O review não atesta paridade com o Rive nem uso na janela Electron.

## Resultado

O review encontrou 13 pontos. Doze foram corrigidos com teste de regressão. O 13º é comportamento intencional e passou a ser documentado. O defeito do botão Grade (achado 1) já estava no commit `d3aaf093`, anterior a este escopo, mas fica no mesmo componente e foi tratado aqui.

## Achados

**Inspetor da prancheta**

1. O botão Grade mudava o fluxo sem definir colunas, e o documento recusa grade sem colunas. Também não era possível sair de uma grade. Ao escolher Grade, o inspetor agora usa duas colunas fixas ou mantém as colunas já definidas, e as remove ao trocar para outro fluxo.
2. Um arraste que terminava no valor inicial deixava aplicado o último valor da prévia. Agora o valor de soltura é sempre aplicado.
3. A prévia do arraste redesenhava o editor inteiro a cada quadro. Agora ela só reposiciona a moldura (`applyArtboardView`), e o editor é redesenhado uma vez, ao soltar. O E2E verifica que o campo não é remontado durante o arraste.
4. Com eixos vinculados, sair de 0 igualava o outro eixo ao novo valor. Agora o outro eixo recebe a mesma variação, e a proporção continua valendo fora do zero.
5. Com duas casas, um valor positivo pequeno virava 0. Isso recusava a largura com uma mensagem enganosa e achatava a escala do objeto. Agora esse caso é recusado com "Use pelo menos 0,01", o mínimo de W/H passou a 0,01 e valores antigos menores que 0,01 aparecem com dois algarismos significativos.
6. A regra das duas casas tinha entrado no campo numérico compartilhado e afetava formulários fora do inspetor, como os inputs do Testar e a configuração de componentes. Agora ela vale só no inspetor (prancheta e transformação do objeto), por meio de `form-values.ts`.

**Motor de layout (`edi-motion`)**

7. Uma grade na raiz com altura em Conteúdo forçava todas as linhas à altura da maior célula. Agora ela segue o mesmo critério das grades aninhadas.
8. O modo Conteúdo recusava filhos absolutos que preenchem o eixo, mas eles não participam da medida. Agora a regra de dependência circular ignora filhos absolutos, na raiz e nos contêineres.
9. Um SVG sem `viewBox` usava tamanho de design 0 nos eixos Fixo. Agora esses eixos usam o viewport.

**Dados da prancheta**

10. A inspeção de comportamento do assistente não mostrava `behavior.data.context`. Um `behavior replace` podia apagar o modelo da prancheta sem aviso. `get_behavior` agora devolve `dataContext`, e a orientação do assistente pede para preservá-lo.
11. Quando a instância ligada estava ausente, a mensagem era um erro genérico de caminho. As validações do contexto e da travessia de listas agora vêm antes da resolução dos caminhos.
12. O alvo "Instância da prancheta" vinha selecionado mesmo ao editar outra instância ou ao escolher um caminho que atravessa lista. Agora ele só vem selecionado para a instância ligada e não é oferecido para caminhos com lista (`dataPathCrossesList`).
13. `reset()` volta à instância padrão do documento. Esse comportamento é intencional e agora está descrito no README do `edi-motion`, no tipo do handle React e no README do pacote React exportado.

## Evidências

- Unitários: 183 no `edi-motion` e 292 no app.
- E2E novos: `tests/e2e/artboard-runtime.test.ts` (tamanho da raiz no player, SVG sem viewBox, `bindDataInstance`, `onDataChange`, `reset`) e extensões em `tests/e2e/artboard-inspector.test.ts`.
- Suíte E2E completa do EdiSVG: 125/125. Typecheck do app e do `edi-motion` limpo, testes Next passando, lint sem achados novos (os que restam já existiam, como a formatação do `app.js`).
