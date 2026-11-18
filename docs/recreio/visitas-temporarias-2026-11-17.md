# Recreio: visitas temporárias com anfitrião

Incremento F5 autorizado, em desenho e fundação de schema. Ainda sem serviço,
contrato negociado, interface ou implantação. Requisitos e demais aceites no
[plano de mundos](mundos-completos-2026-11-17.md).

## Separação e autoridade

Convite de visita e concessão temporária terão tabelas próprias. Não colocar
convites de visita na tabela dos convites dirigidos de membro: um leitor antigo
poderia interpretar o UUID como autorização permanente depois de um rollback.
Visitar não insere nem restaura `space_members`, não concede gestão e não muda
progresso ou titularidade dos demais participantes.

O anfitrião precisa ser um participante permanente atual e estar na partida.
A instância atesta sua presença privada sob mundo, cerca, SID e membro atuais;
isso não é presença pública nem localização exposta aos amigos. O destinatário
é conhecido, com amizade e aprovações atuais. A decisão do mundo e as dos
responsáveis por menores são separadas. Todos os escritores conservam a ordem
de contas → mundo → perfis → aparelho/sessão → prova da concessão.

A visita fica vinculada à presença específica, ao SID e à cerca do anfitrião.
Prazo máximo de 24 horas, sem extensão em recuperação de resposta. Fechar a
presença, encerrar o SID, trocar a cerca, revogar a autoridade ou vencer o prazo
impede novas admissões. Retorno do anfitrião não reativa a concessão anterior.
Renovação de presença só mantém uma linha ativa; nunca reabre uma encerrada.

Cliente, manifesto e instância precisam negociar suporte. O Morada continua
sem essa capacidade até sua própria evolução; a plataforma provará visitas
num jogo interno independente. Endpoints e respostas de membro existentes
continuam recusando alguém que só tenha visita, inclusive em leitores antigos.

## Fundação inicial

`world_host_presences` associa membro permanente, SID/perfil, posse/cerca e
instância por FKs. A transação também precisa conferir que todos pertencem ao
mesmo jogo/mundo, que a posse está vigente e que a instância é a titular.
O vínculo sessão/perfil ou posse/cerca isoladamente não comprova isso.

Cada entrada usa UUID e hash de repetição da instância. Uma presença ativa por
perfil/mundo; nonce repetido com outro corpo é conflito. Prova de presença com
validade curta, no máximo 45 segundos desde a última atualização e limitada a
uma janela de 24 horas. Retenção técnica até 30 dias após essa janela. A rotina
precisa encerrar provas vencidas e purgar em lotes antes de eliminar sessões,
posses ou membros referenciados. As colunas não concedem acesso por si só.

## Próximos incrementos e provas

1. Gerar/conferir a migration aditiva da presença pelo GitHub, sem editar SQL,
   snapshot ou journal; testar constraints, concorrência, nonces e retenção.
2. Implementar atestado de entrada/saída e atualização em lote somente por
   instância autenticada e com posse vigente. Saída encerra definitivamente a
   prova; falha de comunicação impede readmitir visitantes até confirmação.
   Troca de cerca invalida provas da instância anterior.
3. Acrescentar convites, aprovações e concessões de visita separados, com
   amizade, versões/gerações, classificação, capacidade e prazo sob trava.
   Provar que nenhum fluxo escreve participação permanente.
4. Negociar SDK/host e implementar abertura/renovação/encerramento próprios da
   visita. Batimento e runtime precisam interromper o visitante ao perder a
   prova, inclusive sem navegador cooperante. Não anunciar SID encerrado sem
   seu recibo, nem inventar confirmação de salvamento.
5. Entregar caixa/estante temporária, confirmações familiares e revogação
   gratuita. Validar saída pelo jogo, perda do anfitrião, reconexão, queda da
   instância, relógio/prazo, troca de permissões e rollback com clientes antigos.
6. Gates, carga e builds no GitHub; conferir imagens, upgrade com dados,
   restauração e fonte/configuração reais antes de qualquer ativação.

Nenhuma tabela desta fundação foi criada em produção. F6–F11 continuam com
seus próprios critérios; os gates desta frente não encerram a plataforma.

## Geração conferida da presença

Run `44221393949`, fonte `62150c6e6dd2cabec4518915c7e28723a2c82a95`, artefato
`14390189204`; ZIP SHA-256
`35bd94cc12d21819f970654ee5609a3581c19e7b64330d71632666474c73e908`.
SQL somente aditivo, FKs sobre constraints/índices únicos já existentes,
nomes explícitos curtos e CHECK de encerramento com NULL recusado. Prefixo
do journal e predecessor do snapshot conferidos; cópia intacta por bytes/SHA:

- `0198_skinny_captain_britain.sql`: 4660 bytes,
  `4aa7976f1d8f08a9c0aad9edb68f44e235e491e4fe86f951a4e4310d779a77a8`.
- Snapshot: 888950 bytes,
  `5a30bcdc995fdd072bcb672cde5d99080dcb618bcf9ad2d4f946bbd0779b98ea`.
- Journal: 30079 bytes,
  `aa040b62e4cf6cd3f812c66042d42f4513081864f3bfe18c734c4f37dc21755a`.

Dezesseis integrações candidatas criam sessão/mundo/posse/entrada pelas APIs
reais e exercitam FKs, não duplicação, disputa de presença ativa, encerramento
com campos NULL, TTL/janela/retenção, hash e nova identidade após encerrar.
A inserção de teste da presença é direta no PostgreSQL: ainda não comprova
atestado por servidor, visita, renovação, revogação ou funcionamento de tela.
Esses testes ainda precisam executar no GitHub. Journal candidato com 199
entradas; nenhuma alteração operacional ou migration foi aplicada em produção.
