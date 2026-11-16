# Transferência aceita implantada no alfa

Portal e Morada em `92f665e7`, Mundo V2/protocolo 1/arte D2. Proposta, aceite,
recusa e cancelamento disponíveis na Conta, pelas participações próprias.
Os dois adultos usam seus próprios logins; proposta e aceite exigem login
recente. Troca de papéis, retirada das partidas afetadas e auditoria são
atômicas, sem reatribuir criador, participação, moradores ou assinatura.
O antigo responsável pode sair somente depois do aceite.

Os seis gates finais da candidata `37a75491` passaram em `43915310811`:
291 integrações PostgreSQL, incluindo 29 casos de responsabilidade, e dez
jornadas aprovadas, com duas exclusões específicas. A repetição da main
`43918017566` também passou nos seis gates. O CI geral `43918017303` ainda
estava em curso neste registro; não fazer outro push apenas de documentação
para cancelá-lo. A diferença entre a candidata e a fonte publicada é documental.

A primeira implantação do portal (`4dff9c0c`) falhou em `CREATE_CONTAINER`,
antes de iniciar a aplicação, com erro interno genérico do Railway. A segunda
(`5c0ff09a`), da mesma fonte/configuração, iniciou e passou. Isso demonstra
recuperação da implantação, não uma causa corrigida no provedor. Às 17:38:50
UTC foram conferidos fonte, rota compilada, schema 167 e prontidão 200.
Mapas Sentry enviados e release encontrada. O cron de 17:40:50 terminou com
sucesso e as cinco contagens; os oito apps do catálogo e o Admin responderam
200 às 17:41 UTC com o agente de consulta operacional explícito.

O Morada (`1c69178d`) está com Node no PID 1, pronto e com a arte D2 intacta.
Na retirada normal da implantação anterior (`afe83ea7`), o Node recebeu
SIGTERM e confirmou `instancia_encerrada`, zero mundos e zero falhas. Não havia
mundo aberto: essa observação não comprova salvamento de uma partida real em
produção. A prova Docker do GitHub exerce um mundo, mas usa plataforma em memória.

A consulta pontual ao Sentry não encontrou issues pendentes com atividade na
última hora nos projetos Recreio/Morada. Não substitui acompanhamento prolongado.
Configurações dos dois serviços iguais às anteriores, sem mudanças pendentes;
nenhuma migration nova e migrator corretamente ignorado nesta implantação.

O titular adiou a transferência pelas duas contas reais. Não repetir esse pedido
nem considerar a prova humana concluída. A6 ainda inclui remoção, arquivamento,
exportação/exclusão e atendimento. A5, demais retenções, custo/capacidade,
backup agendado, D3–D8, hardware/diversão e homologação comercial continuam abertos.

[Evidências operacionais](evidencias/responsabilidade-producao-2026-11-16.json).
[Contrato da interface e transação](responsabilidade-escrita-2026-11-16.md).
