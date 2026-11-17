# Leitores de restrições antes de habilitar famílias

**Implantado em `ad37ca93` em 17/11**, com `RECREIO_FAMILY_MODE=off`.
[Evidência sanitizada](evidencias/leitores-protegidos-producao-2026-11-17.json).
Migrations 0168–0174 aplicadas antes do portal: 175 recibos e hash da última
conferidos. Restauração lógica atual concluída em destino isolado antes da
publicação. A 0175 de checkpoint permanece em candidata separada.

Publicação intermediária do fechamento do Recreio, com novos fluxos familiares
desligados. A preparação `55dd8da`/`7753bdc` passou nos seis gates, mas a revisão
exigiu incluir a assinatura transacional e a invalidação dos ingressos antes
da implantação. Não publicar a preparação anterior como se contivesse essas
correções. O Morada permanece World2/protocolo1, sem mudança no jogo, arte ou runtime.

## Escopo e gates

- Migrations geradas 0168–0174: identidade composta, cadastro declarado,
  proteção/PIN/pareamento, `minor_context_generation`, política/tempo e índices
  de invalidação. Conferências de origem e hashes estão nos registros de
  cadastro, proteção, F3 e revogação. A produção está na 0174, com os novos
  escritores familiares desligados.
- `RECREIO_FAMILY_MODE=off` é o padrão e o valor da IaC. Bloqueia novos
  cadastros, pareamentos e entrada em perfil infantil por PIN; não bloqueia
  retorno ao adulto/gestão, revogação e saída. `setup` prepara os vínculos;
  `play` é reservado à homologação posterior dos jogos protegidos.
- O painel oculta a entrada de família quando desligado e sem cadastros; os
  vínculos existentes continuam gerenciáveis após desligar. A URL de cadastro
  não oferece novo formulário e a ação direta também recusa.
- A conta adulta pode administrar aparelhos e configurar o próprio PIN sem
  ocupar um perfil de jogador. Pareado ou contexto infantil não herda gestão.
- O executor descartável habilita os fluxos para testes no GitHub. Não rodar
  testes, builds ou cargas nesta máquina.

O CI compartilhado `44013449254` da base passou. A verificação da emissão
`44020586913` passou nos seis gates; a revisão encontrou e reproduziu a
[revogação incompleta de ingressos](ingressos-revogacao-2026-11-17.md), que precisa
da prova verde. `6b5878b` entrou em seis gates e no CI compartilhado
`44022924176`; um ajuste adicional fecha também a sessão nativa que esteja no
contexto infantil revogado. A fonte final `ad37ca93` passou nos seis gates
`44029479872`, com 439 integrações em 35 arquivos, incluindo as negativas
intactas de ingressos e mundos. O CI compartilhado `44022924176` passou em
`6b5878b`; pacotes, lockfile e IaC permanecem idênticos até `ad37ca93`, e o delta
do app foi coberto pelos seis gates finais. A fonte foi integrada à main sem
diferença em jogo, simulação, arte ou servidor do Morada.

## Implantação e retorno

1. Conferir main remota, escopo World2, backup real e gates. Aplicar somente
   migrations, sem sementes comerciais de outros produtos.
2. Implantar leitores com `off` e conferir o valor efetivo e a ausência de
   novos perfis/pareamentos/contextos protegidos. Validar saúde e acesso adulto.
3. Registrar o SHA/deployment como piso de rollback. Depois que um contexto
   nativo protegido existir, uma build antiga que ignora a coluna não pode ser
   usada para retorno; desligar fluxos não apaga essa restrição.
4. Habilitar preparação/jogo somente com os aceites dos incrementos seguintes.

Inclui modelos, kernel de política/tempo, seleção por PIN e estante protegida,
com novos escritores familiares desligados. Não inclui ativação infantil,
troca com checkpoint, social/moderação, cobrança e privacidade integral.
Não representa conclusão do plano.

Conferido em produção às 06:35 UTC: fonte efetiva `ad37ca93`, modo `off`, jogo
interno `0`, nenhum menor/pareado/contexto restrito. Portal e Morada com ready
200; SDK sem token, 401. Manutenção autenticada respondeu 200 com dez contagens.
Sentry confirmou a release e o build confirmou upload dos mapas. O migrator
executou migrações sem seeds comerciais, voltou a seguir a main e teve o
comando original restaurado, sem nova execução dessas seeds.
