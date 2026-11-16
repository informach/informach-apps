# Permissões do Morada na reentrada

Candidata posterior à preparação da responsabilidade aceita (`3b31943b`).
Ainda não implantada; não oferece nem aceita transferência pelo portal.

O servidor parava na primeira concessão encontrada e mantinha o papel antigo
nas reentradas. A projeção agora usa o membro e o papel atuais recebidos da API
das instâncias. Responsável recebe as famílias do mundo; membro ou coadmin
recebe a família indicada, ou a primeira quando a participação é nula conforme
o contrato atual. Uma indicação explícita ausente ou malformada é recusada,
antes de substituir uma conexão existente e sem conceder outra família.

A fundação possui um recibo próprio de autor e família: a troca de responsável
não retira esse direito do fundador. As demais concessões do servidor são
projeções do Recreio, atualizadas pelos fatos existentes de concessão/revogação.
Futuras concessões independentes precisam registrar a própria proveniência;
não podem ser adicionadas como se fossem projeções deste contrato.

Permissões diferentes são gravadas antes da fotografia de admissão. Igualdade
de capacidades não cria novos fatos de acesso. A recuperação usa o mesmo diário
e preserva IDs, moradores, fundos e o recibo de fundação. O formato do mundo,
o protocolo e a arte permanecem nos contratos da produção atual.

Os testes da instância real cobrem promoção, rebaixamento, recuperação por
nova posse, direito do fundador, três indicações inválidas, reentrada sem novos
fatos, falha do diário e retirada de famílias fora da participação. A plataforma
em memória fornece apenas a identidade e o papel atuais; as asserções verificam
simulação, conexões e persistência reais do servidor. Execução pesada somente
no GitHub. A execução `43896380796`, fonte `9d97fa0c`, aprovou os seis gates:
156 testes do servidor, incluindo os oito novos, 259 integrações PostgreSQL e
nove testes de navegador aprovados com duas exclusões específicas. Implantação
e conclusão do CI geral dos leitores continuam pendentes neste registro.

A atualização afeta a próxima admissão. O futuro aceite da responsabilidade
deverá encerrar as sessões dos dois envolvidos atomicamente com a troca do
papel, e o cursor já preparado propaga o encerramento no batimento seguinte.
Este incremento sozinho não muda papéis em produção nem autoriza sessões
antigas depois de uma troca.
