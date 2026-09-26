# Lote 34 de autoria

**Faixa:** 70 atividades, de `problemas-com-desenho-1-1` a `bank:exam:mirim-1-12`.

Fecha o catálogo com resolver com desenho (representar com bolinhas e tracinhos, repartir igualmente com sobra, ordenar com pistas, tentar e conferir, e problemas de dois passos explicados com uma frase) e com os bancos reservados da Mirim 1, diagnóstico e simulado de 12 questões cada a partir do seed 504, escolhido com `tools/seed-search.tool.ts`.

**Resultado:** 46 itens de ensino e 24 reservados. Com este lote o catálogo passa a 291 missões e 2.960 atividades autorais únicas, em catorze trilhas do 2º ano à 3ª série do ensino médio, e todos os níveis do acervo têm trilha publicada.

## Acabamento transversal das ondas 1 a 4

Junto com este lote entram três ajustes que valem para todas as habilidades das faixas novas. Os itens legados não mudam.

- **Pista de tamanho nas alternativas.** Em 226 questões de múltipla escolha a resposta certa era bem mais longa que as erradas e se entregava pelo tamanho. A justificativa saiu da alternativa e foi para a explicação, e as alternativas erradas que eram piada viraram erros reais, cada uma com retorno próprio. O inventário ganhou a invariante `answerLengthCues`, que recusa a resposta com mais de 1,6 vez o tamanho da maior errada e mais de 15 caracteres de diferença.
- **Dicas.** A segunda dica deixou de mostrar o nome interno da família de questões. Agora ela lembra a primeira frase da missão, e as habilidades de 2º a 5º ano usam frases curtas próprias para quem está aprendendo a ler.
- **Ordenação e justificativa das missões 4 e 5.** Os passos de conferir e de comparar dois caminhos ganharam enunciado próprio com o nome da missão, e versões em palavras simples para os anos iniciais. A rubrica da justificativa cita a ideia central da habilidade.

Todos os itens alterados passaram por nova conferência independente antes de os hashes entrarem em `reviewed-catalog.ts`.
