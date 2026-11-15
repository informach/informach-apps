# Recuperação explícita do Morada

Comando operacional em implementação em 15/11/2026; conferir o resultado do candidato no [registro](execucao-2026-11-15.md). Não é uma prova de restauração do backup real em produção.

O comando roda no portal, com a conexão operacional do Recreio. O servidor do Morada conserva apenas sua API HTTP e nunca recebe banco. A simulação valida/reconstrói o estado; os repositórios e endpoints de armazenamento continuam opacos ao conteúdo do jogo. Não há endpoint público de restauração nem exposição de conteúdo pelo Bastidores.

## Procedimento

1. Drenar a instância do jogo e esperar que o mundo fique hibernando e sem posse aberta. Recolher posses vencidas pela manutenção. Um mundo que ainda pode estar sendo gravado é recusado, mesmo que o prazo de uma posse tenha passado.
2. Listar as fotografias retidas: `pnpm --filter @informach/recreio-app restaurar-morada --mundo UUID`. A saída tem até 100 metadados; `--antes REVISAO` continua a listagem. Não inclui nomes ou estado das famílias.
3. Preparar com `--mundo UUID --revisao FONTE --revisao-atual ATUAL --motivo CODIGO`. Guardar o UUID de operação devolvido e conferir a revisão, ticks, fatos reaplicados e tamanho. Essa etapa não publica uma revisão.
4. Aplicar repetindo os argumentos, acrescentando `--operacao UUID_DA_PREPARACAO --aplicar`. A revisão atual precisa continuar igual. Se houve abertura, escrita, alteração dos bytes ou mudança de época, repetir a preparação depois de resolver o conflito.
5. Conferir o recibo e reabrir o mundo. Validar os fatos críticos e a janela de deriva restaurada. Na perda da resposta, repetir exatamente a mesma operação UUID e os mesmos argumentos; o recibo anterior é devolvido inclusive se o mundo já voltou a jogar. Nunca inventar outro UUID para superar uma resposta desconhecida.

`DATABASE_URL` chega pelo ambiente operacional, nunca por argumento. A aplicação exige motivo de 2–40 caracteres (`a-z`, números e `_`), não texto livre. A CLI só exibe ids, revisões, ticks, contagens e tamanhos; falhas não imprimem mensagens de banco ou do decoder. Respostas desconhecidas são tratadas como não confirmadas.

## Garantias e limites

A fotografia escolhida precisa ter tamanho/checksum íntegros, mundo/tick/formato coerentes e diário contínuo até o topo confirmado. A expansão é limitada a 64 MiB; o material é limitado a 131.072 fatos e ao orçamento das fotografias retidas. A reconstrução acontece fora das travas. A aplicação trava operação UUID → mundo, relê/faz o hash do material e publica uma nova revisão monotônica junto com `recreio.space_restored`. Falha da auditoria reverte ambos. Reutilizar o UUID com outros argumentos é recusado.

A nova fotografia já contém todos os fatos reaplicados. O comando conserva as fotografias e o diário anteriores, sem aparar/compactar durante a recuperação. A retenção normal volta a valer nas gravações futuras. Não se recupera a deriva posterior à fotografia escolhida que nunca foi registrada no diário; a janela deve aparecer na análise do incidente. Um diário ausente/incompleto não é tratado como mundo novo.

Antes de declarar operação homologada, executar no GitHub a integração/E2E e depois o ensaio autorizado do backup real em destino isolado, com RPO/RTO medidos. Não colocar dados reais das famílias ou arte licenciada nos artefatos públicos do GitHub.
