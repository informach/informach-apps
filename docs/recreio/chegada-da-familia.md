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
