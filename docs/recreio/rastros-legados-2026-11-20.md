# Índice de privacidade dos mundos antigos

A consulta read-only de 21/11 às 01:58:30 UTC encontrou dois mundos, dez
fotografias, um perfil, duas associações, sete sessões de jogo históricas e
zero `profile_world_traces`. As sete sessões ainda referenciam mundos e não
têm rastro correspondente. Contagens não são conteúdo ou permissão.

O writer atual registra o rastro na mesma transação da admissão autoritativa;
isso não reconcilia as sessões de antes da criação do índice. Sem a adoção,
uma pessoa que já saiu de um mundo pode ficar fora da descoberta de vínculos
para sua retirada. Participação atual e índice de privacidade são distintos.

## Alteração e gates

`rastros-legados-repository.ts` examina pares distintos perfil/mundo das sessões
que receberam `space_id` na admissão, incluindo sessões encerradas. Sem mundo
admitido não há rastro. Exige jogo correspondente, no máximo mil pares por
rodada e prazos SQL explícitos. Não trunca uma origem excedente como se fosse
conclusão. Inspeção é read-only. Aplicação trava mundos e depois perfis em
ordem, relê a barreira de direitos e recusa perfil retirado/em retirada.

A inserção não altera vínculo, permissão, fotografia, sessão ou mundo. Conflito
preserva a data existente. A auditoria estrita, só com origem e contagem, fica
na mesma transação. Falha de auditoria reverte tudo; não há IDs de sessão nos
logs ou no recibo operacional.

`test:world-traces` usa banco descartável exclusivo pelo runner existente,
com configuração própria. A prova parte de admissão real pelas APIs, remove
somente o índice da fixture para simular legado e cobre inspeção, repetição,
preservação, rollback da auditoria, sessão sem mundo e retirada consentida.
Tipos, testes e builds ficam no GitHub; nada pesado nesta máquina.

## Execução operacional prevista

Depois dos gates, subir processo Railway temporário, sem domínio/volume/cron,
com a fonte exata e somente DATABASE_URL privado com TLS obrigatório e o modo
`RECREIO_WORLD_TRACE_RECONCILIATION_MODE=inspect`. Confirmar recibo da aplicação,
não somente SUCCESS do Railway. Em seguida, aplicar a mesma fonte no modo
`apply`, conferir contagens, repetir e conferir zero inserções/ausência de
referências descobertas sem índice. Confirmar saúde/versão do portal e Morada;
remover o executor temporário. Não fornecer credenciais reais ao GitHub.

A conciliação produtiva ainda não foi executada. Esta adoção cobre a origem
histórica persistida; não prova, sozinha, cobertura de todos os identificadores
nos formatos antigos das fotografias ou encerramento integral de F7.
