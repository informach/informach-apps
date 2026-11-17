# Recreio: gestão e visitas de mundos

Plano de F5, autorizado pelo fechamento da plataforma. Fonte de requisitos:
`artes-3d/paginas/recreio.html` v2.2 e
[fechamento web](fechamento-plataforma-2026-11-16.md). Não declara entrega.

## Contratos

- Responsável nomeia ou retira coadministrador adulto, com login próprio
  recente. Coadministrar não transfere responsabilidade nem cobertura comercial.
  Menor, aparelho pareado, pagante sem participação e ex-membro não recebem
  poderes por consequência de compra ou parentesco.
- A configuração de convites do mundo tem três opções: não, com aprovação
  (padrão) e sim. Responsável/coadministrador aprovam convites de membros.
  Convite direto de membro limita-se à participação já atribuída a ele ou à
  visita. Não aceitar texto arbitrário como prova de que a família é dele.
- Convite dirigido exige destinatário conhecido, amizade atual autorizada e
  ausência de bloqueio nas duas pontas. Proteção infantil exige aprovação atual
  do responsável nativo; aprovação do mundo e aprovação parental são fatos
  distintos. Um aceite relê todas as autorizações e a política de conteúdo.
- Visita é uma concessão separada de participação. Tem prazo máximo de 24 horas,
  anfitrião explicitamente vinculado e revogação. Sair o anfitrião encerra a
  visita; retomá-la exige convite novo. Nunca fabricar `SpaceMember` temporário
  para enganar as regras atuais. Jogo precisa negociar suporte à entrada de
  visitante; cliente antigo continua no protocolo de membro existente.
- Arquivar preserva membros, diário, fotografias e autoria. Exige partida e
  posse encerradas com os recibos existentes; não fabricar ACK, terminar jogo
  com escrita pendente ou reinicializar contador de cerca. Retomar conserva IDs
  e conteúdo. Perder assinatura não apaga mundo nem concede administração.
- Participantes podem bloquear, silenciar e denunciar outro participante sem
  amizade. O servidor captura somente a referência da coparticipação autorizada,
  sem conteúdo do jogo. Bloquear impede novos convites/visitas entre as pontas;
  não expulsa automaticamente membro permanente nem apaga progresso alheio.

## Execução em incrementos

1. Gestão nativa: revisão de gestão distinta de fotografia/cerca, contexto
   atual sob travas, nomeação/retirada de coadministrador, política de convites,
   arquivar/retomar, auditoria atômica e leitura sem exigir plano.
2. Convites dirigidos: recibo idempotente, decisões de mundo e responsáveis,
   expiração/revogação e releitura no aceite. Preservar convites adultos legados
   em prazo; não reinterpretá-los como convite infantil aprovado.
3. Visitas: tabela e identidade próprias, capacidade negociada de SDK/host,
   entrada/renovação com prazo e anfitrião atual, revogação/limpeza e prova num
   servidor interno. A plataforma não depende da evolução D3–D8 do Morada.
4. Superfície de participantes: listagem mínima autorizada, presença sem
   localização pública, proteção/denúncia sem amizade e aplicação dos bloqueios
   às novas concessões de mundo.
5. Jornadas: dois adultos, coadmin, membro, menor e responsável sem jogador;
   recusas por HTTP, concorrência com saída/remoção/transferência, expiração,
   resposta perdida, auditoria recusada, restauração e upgrade com dados.

Migrations aditivas geradas no GitHub e conferidas por origem/bytes/hash. Não
editar SQL/snapshot/journal. Gates e builds pesados exclusivamente no GitHub.
Nenhum incremento habilita famílias ou venda por conta própria. A implantação
continua exigindo fonte/configuração real, compatibilidade de todos os
consumidores e os demais aceites F1–F11.

## Candidata de fundação

`3fb90a5e` gerou a migration 0191 no GitHub, run `44183203749`, artefato
`14371724208`. ZIP SHA-256
`32a710b419765f7479505608aba2d6981b39488b7114348634d4a5dd215983a3`.
Três arquivos conferidos por origem, tamanho e hash e copiados intactos:

- SQL `0191_ordinary_xorn.sql`: 359 bytes,
  `759ed5f5d0a5b6d0838826d5a0b1f69fc24aeb2f72f760a5fa8839facd4acea5`.
- Snapshot: 853268 bytes,
  `9ed2039fbfeea2866b48a6a87e44bce703a01727ab37fe64a87e9685644b14f3`.
- Journal: 29047 bytes,
  `ff2454586bea485681bce3929ea3c030f9640e84e2315b367309a1843ec6ff15`.

Apenas duas colunas aditivas e check de revisão positiva. Não muda revisões
de fotos/cercas ou inventa data para arquivo legado. Produção continua com
184 recibos; esta candidata exige 192, incluindo as migrations F4 ainda privadas.

O backend candidato usa conta/login nativo atual, perfil próprio adulto,
participação e responsabilidade atuais, login recente e CAS da gestão.
Trocar o papel encerra somente as partidas do perfil naquele mundo. Arquivar
recusa SID ou posse não encerrados, preserva bytes e vínculos, revoga convites
com auditoria e não fabrica checkpoint. Retomar conserva a cerca crescente.
Transferência aceita também incrementa a revisão de gestão.

A revisão encontrou a ordem perfil → mundo em quatro fluxos antigos.
Leitores de responsabilidade/membros, saída e transferência passam a tomar o
mundo antes de perfil/aparelho, conservando suas revalidações. Quatro testes
seguram a linha do mundo, observam o bloqueio por `pg_blocking_pids` e exigem
que um `FOR UPDATE NOWAIT` no perfil continue disponível. Outros ensaios cobrem
CAS concorrente, papel infantil, aparelho pareado, login encerrado/antigo,
rollback real de auditoria e ciclo de fotografia/posse por HTTP.

Ainda não verificados remotamente neste registro. Leitura e telas nativas,
convites dirigidos/aprovações, visitas e proteção de participantes continuam
por concluir. Não publicar essa fonte como F4 pronta nem migrar automaticamente
estas tabelas com base em gates de uma candidata anterior.
