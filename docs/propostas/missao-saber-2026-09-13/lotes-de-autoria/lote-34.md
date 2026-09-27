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

## Revisão completa antes do deploy

Nove revisores independentes leram tudo o que foi implementado: seis no conteúdo, divididos por faixa, e três no código (lógica, segurança e operação, textos e experiência). Nenhum gabarito estava errado. As correções aplicadas foram:

- **Conteúdo.** Enunciados que dependiam de algo não dito (pesos iguais na balança, dobras de papel, posições em mapas), retornos que não descreviam o erro da alternativa, uma alternativa exibida como "3.5", fatos brasileiros desatualizados (teto do rotativo, impostos tratados como taxa fixa, poupança), textos com cara de garantia e geradores que repetiam questões das missões ou formatavam números sem ponto de milhar. As justificativas e ordenações dos anos iniciais passaram a falar da missão em que aparecem, com dicas em palavras de criança.
- **Código.** Uma missão aberta na trilha antiga deixou de travar a página depois da virada de ano ou de uma troca de trilha: ela é encerrada como interrompida. O mês de nascimento não vai mais ao navegador em toda página. A edição de perfil registra eventos de auditoria só com nomes de campo, e o consentimento ganhou histórico append-only. A exclusão de conta pelo Missão Saber recusa quando a pessoa tem dados na Agenda ou no Cozya e indica o app que sabe apagá-los.
- **Textos.** Oferta gratuita descrita igual em todo lugar, relatório da família descrito como gratuito, termos com os nomes completos das olimpíadas, faixas de ano com plural e "ensino médio" por extenso nas frases, e formulário de perfil sem ano pré-escolhido.

Todos os itens alterados tiveram o hash de revisão registrado de novo depois da conferência.
