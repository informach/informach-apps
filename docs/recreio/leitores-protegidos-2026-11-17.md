# Leitores de restrições antes de habilitar famílias

Publicação intermediária do fechamento do Recreio. A base é `55dd8da`, com
gestão sem jogador e os leitores de pareamento/PIN/restrição nativa, após os
seis gates `44012134895`. Esta candidata acrescenta ativação em fases e mantém
o Morada World2/protocolo1, sem mudança no jogo, arte ou runtime.

## Escopo e gates

- Migrations geradas 0168–0171: identidade composta, cadastro declarado,
  proteção/PIN/pareamento e `minor_context_generation`. Conferências de origem
  e hashes estão nos registros de cadastro e proteção. A produção continua na
  0167 até conferir backup, gates e executar a implantação desta candidata.
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

Novos gates desta candidata e implantação ainda pendentes. O CI compartilhado
da base (`44013449254`) está em andamento; não confundir seus testes dos outros
apps com uma implantação desta candidata.

## Implantação e retorno

1. Conferir main remota, escopo World2, backup real e gates. Aplicar somente
   migrations, sem sementes comerciais de outros produtos.
2. Implantar leitores com `off` e conferir o valor efetivo e a ausência de
   novos perfis/pareamentos/contextos protegidos. Validar saúde e acesso adulto.
3. Registrar o SHA/deployment como piso de rollback. Depois que um contexto
   nativo protegido existir, uma build antiga que ignora a coluna não pode ser
   usada para retorno; desligar fluxos não apaga essa restrição.
4. Habilitar preparação/jogo somente com os aceites dos incrementos seguintes.

Não inclui política/tempo de jogo (0172–0173), amigos/moderação, cobrança,
privacidade integral ou ativação infantil. Não representa conclusão do plano.
