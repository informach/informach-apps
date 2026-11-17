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
